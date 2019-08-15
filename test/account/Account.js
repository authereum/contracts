const { TestHelper } = require('zos')
const { Contracts, ZWeb3 } = require('zos-lib')
const { BN, balance, expectEvent, expectRevert, send } = require('openzeppelin-test-helpers')
const isValidSignature = require('is-valid-signature')

const { setENSDefaults, getArbitrarySignedMessage, getArbitraryBytesSignedMessage, getAuthSignedMessage, getSignedLoginKey, concatHex, getFailedTxHash } = require('../utils/utils')
const constants = require('../utils/constants.js')

ZWeb3.initialize(web3.currentProvider)

const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactBadTransaction = artifacts.require('BadTransaction')
const AuthereumAccount = Contracts.getFromLocal('AuthereumAccount')

contract('Account', function (accounts) {
  const OWNER = accounts[0]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6]]
  const RECEIVERS = [accounts[7]]
  const ENS_OWNER = accounts[8]
  const AUTHEREUM_OWNER = accounts[9]
  const LOGIN_KEY = accounts[10]

  // Params
  let badContract
  let accountProxy
  let nonce
  let destination
  let value
  let data
  let gasLimit

  beforeEach(async () => {
    const project = await TestHelper()
    
    // Deploy Bad Contract
    badContract = await ArtifactBadTransaction.new()

    // Set up ENS defaults
    const { authereumEnsManager } = await setENSDefaults(AUTHEREUM_OWNER, ENS_OWNER)

    // Create proxy
    accountProxy = await project.createProxy(
      AuthereumAccount, {initMethod: 'initialize', initArgs: [AUTH_KEYS[0], authereumEnsManager.address, "myName"]}
    )

    // Wrap proxy in truffle-contract
    accountProxy = await ArtifactAuthereumAccount.at(accountProxy.address)

    // Transaction parameters
    nonce = 0
    destination = RECEIVERS[0]
    value = constants.ONE_ETHER
    data = '0x00'
    gasLimit = constants.GAS_LIMIT
  })

  describe('fallback', () => {
    it('Should log the addition of funds to a contract', async () => {
      var { logs } = await accountProxy.sendTransaction( { value: constants.ONE_ETHER, from: AUTH_KEYS[0] })
      expectEvent.inLogs(logs, 'FundsReceived', { sender: AUTH_KEYS[0], value: constants.ONE_ETHER })
    })
    it('Should allow anyone to send funds to the contract', async () => {
      var { logs } = await accountProxy.sendTransaction({ value: constants.ONE_ETHER, from: AUTH_KEYS[1] })
      expectEvent.inLogs(logs, 'FundsReceived', { sender: AUTH_KEYS[1], value: constants.ONE_ETHER })
      var { logs } = await accountProxy.sendTransaction({ value: constants.TWO_ETHER, from: RELAYER })
      expectEvent.inLogs(logs, 'FundsReceived', { sender: RELAYER, value: constants.TWO_ETHER })
      var { logs } = await accountProxy.sendTransaction({ value: constants.ONE_ETHER, from: OWNER })
      expectEvent.inLogs(logs, 'FundsReceived', { sender: OWNER, value: constants.ONE_ETHER })
    })
  })
  describe('getAuthKeysArrayLength', () => {
    it('Should return a length of 1 as default', async () => {
      len = await accountProxy.getAuthKeysArrayLength()
      assert.equal(len, 1)
    })
    it('Should return a length of 2 after adding an authKey', async () => {
      await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
      len = await accountProxy.getAuthKeysArrayLength()
      assert.equal(len, 2)
    })
    it('Should return a length of 1 after adding and removing an authKey', async () => {
      await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
      len = await accountProxy.getAuthKeysArrayLength()
      assert.equal(len, 2)
      
      await accountProxy.removeAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
      len = await accountProxy.getAuthKeysArrayLength()
      assert.equal(len, 1)
    })
  })
  describe('getNonce', () => {
    it('Should return a length of 0 as default', async () => {
      var nonce = await accountProxy.getNonce()
      assert.equal(nonce, 0)
    })
    it('Should return a length of 0 as default, send a tx, then return a tx of 1', async () => {
      var nonce = await accountProxy.getNonce()
      assert.equal(nonce, 0)

      await accountProxy.executeTransaction(
        destination, value, data, gasLimit, { from: AUTH_KEYS[0] }
      )

      nonce = await accountProxy.getNonce()
      assert.equal(nonce, 1)
    })
  })
  describe('addAuthKey', () => {
    context('Happy Path', async () => {
      it('Should add an authKey', async () => {
        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        const authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[1] })

        const authKeysArrayEntry = await accountProxy.authKeysArray(1)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[1])

        const authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 1)
      })
      it('Should add two authKeys', async () => {
        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        const authKey1 = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey1, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[1] })

        let authKeysArrayEntry = await accountProxy.authKeysArray(1)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[1])

        let authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 1)

        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        const authKey2 = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey2, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[2] })

        authKeysArrayEntry = await accountProxy.authKeysArray(2)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[2])

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[2])
        assert.equal(authKeysArrayIndexEntry, 2)
      })
    })
    context('Non-happy Path', async () => {
      it('Should not add the same authKey twice', async () => {
        await expectRevert(accountProxy.addAuthKey(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), "Auth key already added")
      })
    })
  })
  describe('addMultipleAuthKeys', () => {
    context('Happy Path', async () => {
      it('Should add two authKeys', async () => {
        var { logs } = await accountProxy.addMultipleAuthKeys([AUTH_KEYS[1], AUTH_KEYS[2]], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)

        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[1] })
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[2] })

        len = await accountProxy.getAuthKeysArrayLength()
        assert.equal(len, 3)
      })
      it('Should add three authKeys', async () => {
        var { logs } = await accountProxy.addMultipleAuthKeys([AUTH_KEYS[1], AUTH_KEYS[2], AUTH_KEYS[3]], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[3])
        assert.equal(authKey, true)

        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[1] })
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[2] })
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[3] })

        len = await accountProxy.getAuthKeysArrayLength()
        assert.equal(len, 4)
      })
    })
  })
  describe('removeAuthKey', () => {
    context('Happy Path', async () => {
      it('Should remove an authKey', async () => {
        // Add
        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        let authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[1] })

        let authKeysArrayEntry = await accountProxy.authKeysArray(1)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[1])

        let authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 1)

        // Remove
        var { logs } = await accountProxy.removeAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[1] })

        await expectRevert.unspecified(accountProxy.authKeysArray(1))

        arrayLen = await accountProxy.getAuthKeysArrayLength()
        assert.equal(arrayLen, 1)

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 0)
      })
      it('Should add two authKeys and then remove two authKeys', async () => {
        // Add
        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        let authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[1] })

        let authKeysArrayEntry = await accountProxy.authKeysArray(1)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[1])

        let authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 1)

        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[2] })

        authKeysArrayEntry = await accountProxy.authKeysArray(2)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[2])

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[2])
        assert.equal(authKeysArrayIndexEntry, 2)

        // Remove
        var { logs } = await accountProxy.removeAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[2] })

        await expectRevert.unspecified(accountProxy.authKeysArray(2))

        arrayLen = await accountProxy.getAuthKeysArrayLength()
        assert.equal(arrayLen, 2)

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[2])
        assert.equal(authKeysArrayIndexEntry, 0)

        var { logs } = await accountProxy.removeAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[1] })

        await expectRevert.unspecified(accountProxy.authKeysArray(2))

        arrayLen = await accountProxy.getAuthKeysArrayLength()
        assert.equal(arrayLen, 1)

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 0)
      })
      it('Should add two authKeys and then remove two authKeys in reverse order', async () => {
        // Add
        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        let authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[1] })

        let authKeysArrayEntry = await accountProxy.authKeysArray(1)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[1])

        let authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 1)

        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[2] })

        authKeysArrayEntry = await accountProxy.authKeysArray(2)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[2])

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[2])
        assert.equal(authKeysArrayIndexEntry, 2)

        // Remove
        var { logs } = await accountProxy.removeAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[2] })

        await expectRevert.unspecified(accountProxy.authKeysArray(2))

        arrayLen = await accountProxy.getAuthKeysArrayLength()
        assert.equal(arrayLen, 2)

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[2])
        assert.equal(authKeysArrayIndexEntry, 0)

        var { logs } = await accountProxy.removeAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[1] })

        await expectRevert.unspecified(accountProxy.authKeysArray(1))

        arrayLen = await accountProxy.getAuthKeysArrayLength()
        assert.equal(arrayLen, 1)

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 0)
      })
      it('Should add an authKey and then remove the original authKey', async () => {
        // Add
        var { logs } = await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        let authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[1] })

        let authKeysArrayEntry = await accountProxy.authKeysArray(1)
        assert.equal(authKeysArrayEntry, AUTH_KEYS[1])

        let authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[1])
        assert.equal(authKeysArrayIndexEntry, 1)

        // Remove
        var { logs } = await accountProxy.removeAuthKey(AUTH_KEYS[0], { from: AUTH_KEYS[1] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[0])
        assert.equal(authKey, false)
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[0] })

        await expectRevert.unspecified(accountProxy.authKeysArray(1))

        arrayLen = await accountProxy.getAuthKeysArrayLength()
        assert.equal(arrayLen, 1)

        authKeysArrayIndexEntry = await accountProxy.authKeysArrayIndex(AUTH_KEYS[0])
        assert.equal(authKeysArrayIndexEntry, 0)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not remove an authKey that was never a added', async () => {
        await expectRevert(accountProxy.removeAuthKey(AUTH_KEYS[2], { from: AUTH_KEYS[0] }), "Auth key not yet added")
      })
      it('Should not allow a user to remove all authKeys', async () => {
        await expectRevert(accountProxy.removeAuthKey(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), "Cannot remove last auth key")
      })
    })
  })
  describe('removeMultipleAuthKeys', () => {
    context('Happy Path', async () => {
      it('Should remove two authKeys', async () => {
        await accountProxy.addMultipleAuthKeys([AUTH_KEYS[1], AUTH_KEYS[2]], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)
        var { logs } = await accountProxy.removeMultipleAuthKeys([AUTH_KEYS[1], AUTH_KEYS[2]], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, false)

        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[1] })
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[2] })

        len = await accountProxy.getAuthKeysArrayLength()
        assert.equal(len, 1)
      })
      it('Should remove three authKeys', async () => {
        await accountProxy.addMultipleAuthKeys([AUTH_KEYS[1], AUTH_KEYS[2], AUTH_KEYS[3]], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[3])
        assert.equal(authKey, true)
        var { logs } = await accountProxy.removeMultipleAuthKeys([AUTH_KEYS[1], AUTH_KEYS[2], AUTH_KEYS[3]], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, false)
        authKey = await accountProxy.authKeys(AUTH_KEYS[3])
        assert.equal(authKey, false)

        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[1] })
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[2] })
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[3] })

        len = await accountProxy.getAuthKeysArrayLength()
        assert.equal(len, 1)
      })
    })
  })
  describe('swapAuthKeys', () => {
    context('Happy Path', async () => {
      it('Should swap an oldAuthKey for a newAuthKey', async () => {
        var { logs } = await accountProxy.swapAuthKeys(AUTH_KEYS[0], AUTH_KEYS[1], { from: AUTH_KEYS[0] })

        const arrayLen = await accountProxy.getAuthKeysArrayLength()
        assert.equal(arrayLen, 1)

        expectEvent.inLogs(logs, 'SwappedAuthKeys', { oldAuthKey: AUTH_KEYS[0], newAuthKey: AUTH_KEYS[1] })
      })
      it('Should add a key and swap that one for a newAuthKey', async () => {
        await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        var { logs } = await accountProxy.swapAuthKeys(AUTH_KEYS[1], AUTH_KEYS[2], { from: AUTH_KEYS[0] })

        const arrayLen = await accountProxy.getAuthKeysArrayLength()
        assert.equal(arrayLen, 2)

        expectEvent.inLogs(logs, 'SwappedAuthKeys', { oldAuthKey: AUTH_KEYS[1], newAuthKey: AUTH_KEYS[2] })
      })
    })
    context('Non-happy Path', async () => {
      it('Should not swap an oldAuthKey for a newAuthKey because the old key does not exist', async () => {
        await expectRevert(accountProxy.swapAuthKeys(AUTH_KEYS[2], AUTH_KEYS[1], { from: AUTH_KEYS[0] }), "Old auth key does not exist")
      })
      it('Should not swap an oldAuthKey for a newAuthKey because the new key alrady exists', async () => {
        await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        await expectRevert(accountProxy.swapAuthKeys(AUTH_KEYS[1], AUTH_KEYS[0], { from: AUTH_KEYS[0] }), "New auth key already exists")
      })
    })
  })
  describe('swapMultipleAuthKeys', () => {
    context('Happy Path', async () => {
      it('Should swap two pairs of authKeys', async () => {
        await accountProxy.addMultipleAuthKeys([AUTH_KEYS[1], AUTH_KEYS[2]], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, true)
        var { logs } = await accountProxy.swapMultipleAuthKeys(
          [AUTH_KEYS[1], AUTH_KEYS[2]], [AUTH_KEYS[3], AUTH_KEYS[4]], { from: AUTH_KEYS[0] },
        )
        authKey = await accountProxy.authKeys(AUTH_KEYS[1])
        assert.equal(authKey, false)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2])
        assert.equal(authKey, false)
        authKey = await accountProxy.authKeys(AUTH_KEYS[3])
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[4])
        assert.equal(authKey, true)
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[1] })
        expectEvent.inLogs(logs, 'RemovedAuthKey', { authKey: AUTH_KEYS[2] })
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[3] })
        expectEvent.inLogs(logs, 'AddedAuthKey', { authKey: AUTH_KEYS[4] })

        len = await accountProxy.getAuthKeysArrayLength()
        assert.equal(len, 3)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should fail to swap authKeys due to an uneven length of input arrays', async () => {
        await accountProxy.addMultipleAuthKeys([AUTH_KEYS[1], AUTH_KEYS[2]], { from: AUTH_KEYS[0] })
        authKey = await accountProxy.authKeys(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        assert.equal(authKey, true)
        authKey = await accountProxy.authKeys(AUTH_KEYS[2], { from: AUTH_KEYS[0] })
        assert.equal(authKey, true)
        await accountProxy.swapMultipleAuthKeys(
          [AUTH_KEYS[1], AUTH_KEYS[2]], [AUTH_KEYS[3], AUTH_KEYS[4]], { from: AUTH_KEYS[0] }
        )
        await expectRevert(accountProxy.swapMultipleAuthKeys(
          [AUTH_KEYS[1], AUTH_KEYS[2]], [AUTH_KEYS[3], AUTH_KEYS[4], AUTH_KEYS[5]], { from: AUTH_KEYS[0] }
        ), "Input arrays not equal length")
      })
    })
  })
  describe('executeTransaction', () => {
    context('Happy Path', async () => {
      it('Should execute a transaction and not receive a refund', async () => {
        await accountProxy.addAuthKey(AUTH_KEYS[1], { from: AUTH_KEYS[0] })
        await accountProxy.send(constants.ONE_ETHER, {from: AUTH_KEYS[0]})

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeDestinationBal = await balance.current(destination)
        const beforeAccountBal = await balance.current(accountProxy.address)

        await accountProxy.executeTransaction(
          destination, value, data, gasLimit, { from: AUTH_KEYS[0] }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterDestinationBal = await balance.current(destination)
        const afterAccountBal = await balance.current(accountProxy.address)

        // Destination address gains 1 ETH
        assert.equal(afterDestinationBal - beforeDestinationBal, constants.ONE_ETHER)
        // CBA loses 1 ETH
        assert.equal(beforeAccountBal - afterAccountBal, constants.ONE_ETHER)
        // Transaction sent straight from AUTH_KEYS[0] so RELAYER loses nothing
        assert.equal(beforeRelayerBal - afterRelayerBal, 0)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should revert due to funds never being sent to the contract', async () => {
        var nonce = await accountProxy.getNonce()
        var { logs } = await accountProxy.executeTransaction(
          destination, value, data, gasLimit, { from: AUTH_KEYS[0] }
        )
        
        const failedTxHash = await getFailedTxHash(
          nonce,
          destination,
          value,
          data
        )

        expectEvent.inLogs(logs, 'CallFailed', { encodedData: failedTxHash })
      })
      it('Should emit CallFailed event due to the fact that the data forced the transaction to fail', async () => {
        accountProxy.send(constants.ONE_ETHER, {from: AUTH_KEYS[0] })
        var nonce = await accountProxy.getNonce()
        data = constants.BAD_DATA
        destination = badContract.address
        var { logs } = await accountProxy.executeTransaction(
          destination, value, data, gasLimit, { from: AUTH_KEYS[0] }
        )
        
        const failedTxHash = await getFailedTxHash(
          nonce,
          destination,
          value,
          data
        )

        expectEvent.inLogs(logs, 'CallFailed', { encodedData: failedTxHash })
      })
      it('Should emit CallFailed due to not enough funds in the contract to send', async () => {
        accountProxy.send(1, {from: AUTH_KEYS[0] })
        var nonce = await accountProxy.getNonce()
        var { logs } = await accountProxy.executeTransaction(
          destination, value, data, gasLimit, { from: AUTH_KEYS[0] }
        )

        const failedTxHash = await getFailedTxHash(
          nonce,
          destination,
          value,
          data
        )

        expectEvent.inLogs(logs, 'CallFailed', { encodedData: failedTxHash })
      })
      it('Should revert because a non-approved authKey is sending the transaction', async () => {
        accountProxy.send(constants.ONE_ETHER, {from: AUTH_KEYS[0] })
        await expectRevert(accountProxy.executeTransaction(
          destination, value, data, gasLimit, { from: AUTH_KEYS[1] }
        ), "Auth key is invalid")
      })
    })
  })
  describe('isValidTransaction', () => {
    context('Happy Path', async () => {
      it('Should return the loginKey', async () => {
        const msg = "Hello, World!"
        const bytesMsg = web3.utils.asciiToHex(msg)
        const { messageHash, msgHashSignature } = getArbitrarySignedMessage(bytesMsg)
        const loginKeyAuthorizationSignature = getSignedLoginKey(LOGIN_KEY)
        const loginKey = await accountProxy.validateLoginKeyMetaTxSigs(
          messageHash, msgHashSignature, loginKeyAuthorizationSignature
        )
        assert.equal(loginKey, LOGIN_KEY)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not return the loginKey due to a bad msg', async () => {
        const msg = "Hello, World!"
        const bytesMsg = web3.utils.asciiToHex(msg)
        const { messageHash, msgHashSignature } = getArbitrarySignedMessage(bytesMsg)
        const loginKeyAuthorizationSignature = getSignedLoginKey(LOGIN_KEY)
        await expectRevert(accountProxy.validateLoginKeyMetaTxSigs(
          web3.utils.asciiToHex(msg), msgHashSignature, loginKeyAuthorizationSignature
        ), "Auth key is invalid")
      })
    })
  })
  describe('isValidSignature', () => {
    context('Happy Path', async () => {
      it('Should return the magic value for a login key signature', async () => {
        const msg = "Hello, World!"
        const { msgHashSignature } = getArbitraryBytesSignedMessage(msg)
        const loginKeyAuthorizationSignature = getSignedLoginKey(LOGIN_KEY)
        const combinedSignature = concatHex(msgHashSignature, loginKeyAuthorizationSignature)
        
        assert.equal(await isValidSignature(web3, accountProxy.address, msg, combinedSignature), true)
      })
      it('Should return the magic value for an auth key signature', async () => {
        const msg = "Hello, World!"
        const bytesMsg = web3.utils.asciiToHex(msg)
        const { msgHashSignature } = getAuthSignedMessage(msg)

        assert.equal(await isValidSignature(web3, accountProxy.address, msg, msgHashSignature), true)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not return the magic value for a login key signature due to bad message', async () => {
        const msg = "Hello, World!"
        const badMsg = "Goodbye, World!"
        const { msgHashSignature } = getArbitraryBytesSignedMessage(msg)
        const loginKeyAuthorizationSignature = getSignedLoginKey(LOGIN_KEY)
        const combinedSignature = concatHex(msgHashSignature, loginKeyAuthorizationSignature)

        assert.equal(await isValidSignature(web3, accountProxy.address, badMsg, combinedSignature), false)
      })
      it('Should not return the magic value for an auth key signature due to bad message', async () => {
        const msg = "Hello, World!"
        const badMsg = "Goodbye, World!"
        const { msgHashSignature } = getAuthSignedMessage(msg)

        assert.equal(await isValidSignature(web3, accountProxy.address, badMsg, msgHashSignature), false)
      })
    })
  })
})
