const { TestHelper } = require('zos')
const { Contracts, ZWeb3 } = require('zos-lib')

const constants = require('../utils/constants.js')
const { getMethodSign, setENSDefaults, getLoginKeySignedMessageHash, getSignedLoginKey, getFailedTxHash } = require('../utils/utils')
const { advanceTime, advanceBlock, advanceTimeAndBlock }= require('../utils/time.js')
const { balance, expectEvent, expectRevert } = require('openzeppelin-test-helpers')

ZWeb3.initialize(web3.currentProvider)

const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactBadTransaction = artifacts.require('BadTransaction')
const AuthereumAccount = Contracts.getFromLocal('AuthereumAccount')

contract('LoginKeyMetaTxAccount', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3]]
  const LOGIN_KEYS = [accounts[10], accounts[5]]
  const RECEIVERS = [accounts[6], accounts[7]]

  // Gas costs
  const REFUND_TX_GAS_COST = 1189220000000000
  const APPX_ACCT_COST = 4000000000000000
  const RELAYER_GAS_LOST = 907200000032768
  const APPX_RELAYER_LOST = 25600000000000
  const REFUND_TX_GAS_COST_2 = 889120000000000
  const APPX_ACCT_COST_2 = APPX_ACCT_COST
  const RELAYER_GAS_LOST_2 = 909760000032768
  const APPX_RELAYER_LOST_2 = 10000000000000

  // Message Hash Data
  const MSG_SIG = getMethodSign('executeLoginKeyMetaTx', 'address', 'bytes', 'uint256', 'uint256', 'bytes', 'bytes')

  // Params
  const EXPECTED_RESPONSE = null
  let nonce
  let destination
  let value
  let data
  let gasPrice
  let gasLimit
  let badContract
  let accountProxy
  let transactionDataSignature
  let loginKeyAuthorizationSignature

  // Testing Helpers
  beforeEach(async () => {
    // Default transaction data
    destination = RECEIVERS[0]
    value = constants.ONE_ETHER
    data = '0x00'
    gasPrice = constants.GAS_PRICE
    gasLimit = constants.GAS_LIMIT

    // Deploy Bad Contract
    badContract = await ArtifactBadTransaction.new()

    // Deploy Proxy
    const project = await TestHelper()

    // Set up ENS defaults
    const { authereumEnsManager } = await setENSDefaults(AUTHEREUM_OWNER, ENS_OWNER)

    // Create proxy
    accountProxy = await project.createProxy(
      AuthereumAccount, {initMethod: 'initialize', initArgs: [AUTH_KEYS[0], authereumEnsManager.address, "myName"]}
    )

    // Wrap proxy in truffle-contract
    accountProxy = await ArtifactAuthereumAccount.at(accountProxy.address)

    // Send relayer ETH to use as a transaction fee
    await accountProxy.sendTransaction({ value: constants.TWO_ETHER, from: AUTH_KEYS[0] })
    nonce = await accountProxy.getNonce()
    nonce = nonce.toNumber()

    // Get default signedMessageHash and signedLoginKey
    transactionDataSignature = getLoginKeySignedMessageHash(
      accountProxy.address,
      MSG_SIG,
      constants.CHAIN_ID,
      destination,
      data,
      value,
      nonce,
      gasPrice,
      gasLimit
    )

    loginKeyAuthorizationSignature = getSignedLoginKey(LOGIN_KEYS[0])
  })

  //* ********//
  //  Tests //
  //* ******//
  describe('isValidLoginKey', () => {
    context('Happy Path', async () => {
      it('Should return true', async () => {
        await accountProxy.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        const isValid = await accountProxy.isValidLoginKey(
          LOGIN_KEYS[0], loginKeyAuthorizationSignature, { from: RELAYER }
        )
        assert.equal(isValid.valueOf(), true)
      })
      it('Should return false', async () => {
        await accountProxy.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        const badLoginKeyAuthorizationSignature = loginKeyAuthorizationSignature + 1
        const isValid = await accountProxy.isValidLoginKey(
          LOGIN_KEYS[0], badLoginKeyAuthorizationSignature, { from: RELAYER }
        )
        assert.equal(isValid.valueOf(), false)
      })
    })
  })
  describe('executeLoginKeyMetaTx', () => {
    context('Happy Path', async () => {
      it('Should successfully execute a login key meta tx', async () => {
        await accountProxy.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })

        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeDestinationBal = await balance.current(destination)
        const beforeAccountBal = await balance.current(accountProxy.address)

        await accountProxy.executeLoginKeyMetaTx(
          destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        const afterRelayerBal = await balance.current(RELAYER)
        const afterDestinationBal = await balance.current(destination)
        const afterAccountBal = await balance.current(accountProxy.address)

        // Destination address gains 1 ETH
        assert.equal(afterDestinationBal - beforeDestinationBal, constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.closeTo(beforeAccountBal - afterAccountBal, Number(constants.ONE_ETHER) + Number(REFUND_TX_GAS_COST), Number(APPX_ACCT_COST))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(beforeRelayerBal - afterRelayerBal, Number(RELAYER_GAS_LOST), Number(APPX_RELAYER_LOST))
      })
      it('Should successfully verify and sign two transactions', async () => {
        await accountProxy.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        // Transaction 1
        var beforeRelayerBal = await balance.current(RELAYER)
        var beforeDestinationBal = await balance.current(destination)
        var beforeAccountBal = await balance.current(accountProxy.address)

        await accountProxy.executeLoginKeyMetaTx(
          destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
        )
        
        var afterRelayerBal = await balance.current(RELAYER)
        var afterDestinationBal = await balance.current(destination)
        var afterAccountBal = await balance.current(accountProxy.address)

        // Destination address gains 1 ETH
        assert.equal(afterDestinationBal - beforeDestinationBal, constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.closeTo(beforeAccountBal - afterAccountBal, Number(constants.ONE_ETHER) + Number(REFUND_TX_GAS_COST), Number(APPX_ACCT_COST))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(beforeRelayerBal - afterRelayerBal, Number(RELAYER_GAS_LOST), Number(APPX_RELAYER_LOST))

        // Transaction 2
        data = "0x01"
        nonce = await accountProxy.getNonce()
        transactionDataSignature = getLoginKeySignedMessageHash(
          accountProxy.address,
          MSG_SIG,
          constants.CHAIN_ID,
          destination,
          data,
          value,
          nonce,
          gasPrice,
          gasLimit
        )

        beforeRelayerBal = await balance.current(RELAYER)
        beforeDestinationBal = await balance.current(destination)
        beforeAccountBal = await balance.current(accountProxy.address)

        await accountProxy.executeLoginKeyMetaTx(
          destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        afterRelayerBal = await balance.current(RELAYER)
        afterDestinationBal = await balance.current(destination)
        afterAccountBal = await balance.current(accountProxy.address)

        // Destination address gains 1 ETH
        assert.equal(afterDestinationBal - beforeDestinationBal, constants.ONE_ETHER)
        // CBA loses 1 ETH + refund cost
        assert.closeTo(beforeAccountBal - afterAccountBal, Number(constants.ONE_ETHER) + Number(REFUND_TX_GAS_COST_2), Number(APPX_ACCT_COST_2))
        // Relayer starts and ends with the same value minus a small amount
        assert.closeTo(beforeRelayerBal - afterRelayerBal, Number(RELAYER_GAS_LOST_2), Number(APPX_RELAYER_LOST_2))
      })
      it('Should successfully execute a login key meta whose value is equivalent to the daily limit', async () => {
        await accountProxy.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })

        beforeDestinationBal = await balance.current(destination)

        const dailyLimit = constants.TEN_ETHER
        transactionDataSignature = getLoginKeySignedMessageHash(
          accountProxy.address,
          MSG_SIG,
          constants.CHAIN_ID,
          destination,
          data,
          dailyLimit,
          nonce,
          gasPrice,
          gasLimit
        )

        await accountProxy.executeLoginKeyMetaTx(
          destination, data, dailyLimit, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        afterDestinationBal = await balance.current(destination)

        // Destination address gains daily limit amount of ETH
        assert.equal(afterDestinationBal - beforeDestinationBal, constants.TEN_ETHER)
      })
      it('Should successfully execute a login key meta whose value is equivalent to the daily limit, add to the limit, and do the same thing', async () => {
        await accountProxy.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })

        beforeDestinationBal = await balance.current(destination)

        let dailyLimit = constants.TEN_ETHER
        transactionDataSignature = getLoginKeySignedMessageHash(
          accountProxy.address,
          MSG_SIG,
          constants.CHAIN_ID,
          destination,
          data,
          dailyLimit,
          nonce,
          gasPrice,
          gasLimit
        )

        await accountProxy.executeLoginKeyMetaTx(
          destination, data, dailyLimit, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
        )
          
        afterDestinationBal = await balance.current(destination)
        assert.equal(afterDestinationBal - beforeDestinationBal, constants.TEN_ETHER)

        await accountProxy.changeDailyLimit(constants.TWENTY_ETHER, { from: AUTH_KEYS[0] })

        await accountProxy.sendTransaction({ value: constants.TEN_ETHER, from: AUTH_KEYS[0] })


        beforeDestinationBal = await balance.current(destination)

        nonce = await accountProxy.getNonce()
        transactionDataSignature = getLoginKeySignedMessageHash(
          accountProxy.address,
          MSG_SIG,
          constants.CHAIN_ID,
          destination,
          data,
          dailyLimit,
          nonce,
          gasPrice,
          gasLimit
        )

        await accountProxy.executeLoginKeyMetaTx(
          destination, data, dailyLimit, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
        )

        afterDestinationBal = await balance.current(destination)
        assert.equal(afterDestinationBal - beforeDestinationBal, constants.TEN_ETHER)
      })
    })
    context('Non-Happy Path', async () => {
      context('Bad Parameters', async () => {
        it('Should throw due to surpassing the daily limit', async () => {
        await accountProxy.sendTransaction({ value: constants.TWENTY_ETHER, from: AUTH_KEYS[0] })
          const pastDailyLimit =  web3.utils.toWei('11', 'ether')
          transactionDataSignature = getLoginKeySignedMessageHash(
            accountProxy.address,
            MSG_SIG,
            constants.CHAIN_ID,
            destination,
            data,
            pastDailyLimit,
            nonce,
            gasPrice,
            gasLimit
          )

          await expectRevert(accountProxy.executeLoginKeyMetaTx(
            destination, data, pastDailyLimit, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), "Transaction not within daily limit")
        })
        it('Should emit OverDailyLimit due to surpassing the daily limit after 2 transactions', async () => {
          await accountProxy.sendTransaction({ value: constants.TWENTY_ETHER, from: AUTH_KEYS[0] })
        
          await accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          // Advance time to mimimc real life
          await advanceTime(15) 
          const pastDailyLimit =  constants.TEN_ETHER
          nonce = await accountProxy.getNonce()
          transactionDataSignature = getLoginKeySignedMessageHash(
            accountProxy.address,
            MSG_SIG,
            constants.CHAIN_ID,
            destination,
            data,
            pastDailyLimit,
            nonce,
            gasPrice, gasLimit
          )
          await expectRevert(accountProxy.executeLoginKeyMetaTx(
            destination, data, pastDailyLimit, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), "Transaction not within daily limit")
        })
        it('Should fail to send a transaction due to a failed transaction because of bad data', async () => {
          destination = badContract.address
          data = constants.BAD_DATA
          transactionDataSignature = getLoginKeySignedMessageHash(
            accountProxy.address,
            MSG_SIG,
            constants.CHAIN_ID,
            destination,
            data,
            value,
            nonce,
            gasPrice,
            gasLimit
          )
          var { logs } = await accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
          )
          
          const failedTxHash = await getFailedTxHash(
            nonce,
            destination,
            value,
            data
          )

          expectEvent.inLogs(logs, 'CallFailed', { encodedData: failedTxHash })
        })
        it('Should revert due to not enough funds being in the contract to send the transaction', async () => {
          await accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          nonce = await accountProxy.getNonce()
          transactionDataSignature = getLoginKeySignedMessageHash(
            accountProxy.address,
            MSG_SIG,
            constants.CHAIN_ID,
            destination,
            data,
            value,
            nonce,
            gasPrice,
            gasLimit
          )
          var { logs } = await accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
          )
          
          const failedTxHash = await getFailedTxHash(
            nonce,
            destination,
            value,
            data
          )

          expectEvent.inLogs(logs, 'CallFailed', { encodedData: failedTxHash })
        })
        it('Should revert due to not enough funds being in the contract to send the refund', async () => {
          value = constants.TWO_ETHER
          transactionDataSignature = getLoginKeySignedMessageHash(
            accountProxy.address,
            MSG_SIG,
            constants.CHAIN_ID,
            destination,
            data,
            value,
            nonce,
            gasPrice,
            gasLimit
          )
          // This fails implicitly on the `msg.sender.transfer(_gasUsed.mul(_gasPrice));`
          await expectRevert.unspecified(accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice })
          )
        })
        // TODO: Currently failing due to inconsistent gasLimit values in the internal call
        it.skip('Should revert due to too low of a gasLimit sent with the transaction', async () => {
          gasLimit = 1
          transactionDataSignature = getLoginKeySignedMessageHash(
            accountProxy.address,
            MSG_SIG,
            constants.CHAIN_ID,
            destination,
            data,
            value,
            nonce,
            gasPrice,
            gasLimit
          )
          var { logs } = await accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          const failedTxHash = await getFailedTxHash(
            nonce,
            destination,
            value,
            data
          )
          expectEvent.inLogs(logs, 'CallFailed', { encodedData: failedTxHash })
        })
        it('Should fail to fail to send a transaction due to a bad signed message', async () => {
          transactionDataSignature += 100
          await expectRevert(accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice }
          ), 'Auth key is invalid')
        })
        it('Should fail to fail to send a transaction due the relayer sending an incorrect gasPrice', async () => {
          await expectRevert(accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice + 1 }
          ), 'Auth key is invalid')
        })
        it('Should not refund the relayer for InvalidTransactionDataSigner', async () => {
          const beforeProxyBalance = await balance.current(accountProxy.address)
          const beforeRelayerBalance = await balance.current(RELAYER)

          await expectRevert(accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gasPrice: gasPrice + 1 }
          ), 'Auth key is invalid')

          const afterProxyBalance = await balance.current(accountProxy.address)
          const afterRelayerBalance = await balance.current(RELAYER)

          assert.equal(Number(beforeProxyBalance), Number(afterProxyBalance))
          assert.closeTo(Number(beforeRelayerBalance) - Number(afterRelayerBalance), 1375720000061440, 100000000000000)
        })
        it('Should not refund the relayer for OverDailyLimit', async () => {
          const beforeProxyBalance = await balance.current(accountProxy.address)
          const beforeRelayerBalance = await balance.current(RELAYER)

          value = constants.TEN_ETHER + 1
          transactionDataSignature = getLoginKeySignedMessageHash(
            accountProxy.address,
            MSG_SIG,
            constants.CHAIN_ID,
            destination,
            data,
            value,
            nonce,
            gasPrice,
            gasLimit
          )

          await expectRevert(accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER }
          ), "Transaction not within daily limit")

          const afterProxyBalance = await balance.current(accountProxy.address)
          const afterRelayerBalance = await balance.current(RELAYER)

          assert.closeTo(Number(beforeProxyBalance), Number(afterProxyBalance), 1186440000045056, 100000000000000)
          assert.closeTo(Number(beforeRelayerBalance) - Number(afterRelayerBalance), 760760000053248, 100000000000000)
        })
        it('Should throw and cost the relayer if the relayer does not send a large enough gasLimit', async () => {
          const beforeProxyBalance = await balance.current(accountProxy.address)
          const beforeRelayerBalance = await balance.current(RELAYER)

          const value = beforeProxyBalance
          transactionDataSignature = getLoginKeySignedMessageHash(
            accountProxy.address,
            MSG_SIG,
            constants.CHAIN_ID,
            destination,
            data,
            value,
            nonce,
            gasPrice,
            gasLimit
          )

          await expectRevert(accountProxy.executeLoginKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, loginKeyAuthorizationSignature, { from: RELAYER, gas: gasLimit, gasPrice: gasPrice }
          ), "Insufficient gas for refund")

          const afterProxyBalance = await balance.current(accountProxy.address)
          const afterRelayerBalance = await balance.current(RELAYER)

          assert.equal(Number(beforeProxyBalance), Number(afterProxyBalance))
          assert.closeTo(Number(beforeRelayerBalance) - Number(afterRelayerBalance), 1951840000016384, 100000000000000)
        })
      })
    })
  })
})
