const { TestHelper } = require('zos')
const { Contracts, ZWeb3 } = require('zos-lib')

const constants = require('../utils/constants.js')
const { getMethodSign, setENSDefaults, getAuthKeySignedMessageHash, getFailedTxHash } = require('../utils/utils')

const { balance, expectEvent, expectRevert } = require('openzeppelin-test-helpers')

ZWeb3.initialize(web3.currentProvider)

const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactBadTransaction = artifacts.require('BadTransaction')
const AuthereumAccount = Contracts.getFromLocal('AuthereumAccount')

contract('AuthKeyMetaTxAccount', function (accounts) {
  const AUTHEREUM_OWNER = accounts[0]
  const ENS_OWNER = accounts[8]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4]]
  const RECEIVERS = [accounts[5], accounts[6], accounts[7]]

  // Gas costs
  const REFUND_TX_GAS_COST = 725900000000000
  const APPX_ACCT_COST = 47700000000000
  const RELAYER_GAS_LOST = 883599999991808
  const APPX_RELAYER_LOST = 100000000000000
  const REFUND_TX_GAS_COST_2 = 426080000000000
  const APPX_ACCT_COST_2 = APPX_ACCT_COST
  const RELAYER_GAS_LOST_2 = 799860000030720
  const APPX_RELAYER_LOST_2 = 10000000000000

  // Message Hash Data
  const MSG_SIG = getMethodSign('executeAuthKeyMetaTx', 'address', 'bytes', 'uint256', 'uint256', 'bytes')

  // Parameters
  let nonce
  let destination
  let value
  let data
  let gasPrice
  let gasLimit
  let badContract
  let accountProxy
  let transactionDataSignature

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
    project = await TestHelper()

    // Set up ENS defaults
    const { authereumEnsManager } = await setENSDefaults(AUTHEREUM_OWNER, ENS_OWNER)

    // Create proxy
    accountProxy = await project.createProxy(
      AuthereumAccount, {initMethod: 'initialize', initArgs: [AUTH_KEYS[0], authereumEnsManager.address, "myName"]}
    )

    // Wrap proxy in truffle-contract
    accountProxy = await ArtifactAuthereumAccount.at(accountProxy.address)

    // Send relayer ETH to use as a transaction fee
    await accountProxy.sendTransaction( { value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
    nonce = await accountProxy.getNonce()
    nonce = nonce.toNumber()

    // Get default signedMessageHash and signedLoginKey
    transactionDataSignature = getAuthKeySignedMessageHash(
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
  })

  //* ********//
  //  Tests //
  //* ******//
  describe('executeAuthKeyMetaTx', () => {
    context('Happy Path', async () => {
      it('Should successfully execute an auth key meta tx', async () => {
        await accountProxy.sendTransaction({ value: constants.THREE_ETHER, from: AUTH_KEYS[0] })
        const beforeRelayerBal = await balance.current(RELAYER)
        const beforeDestinationBal = await balance.current(destination)
        const beforeAccountBal = await balance.current(accountProxy.address)
        await accountProxy.executeAuthKeyMetaTx(
          destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
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
        await accountProxy.send(constants.THREE_ETHER, {from: AUTH_KEYS[0]})
        // Transaction 1
        var beforeRelayerBal = await balance.current(RELAYER)
        var beforeDestinationBal = await balance.current(destination)
        var beforeAccountBal = await balance.current(accountProxy.address)

        await accountProxy.executeAuthKeyMetaTx(
          destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
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
        transactionDataSignature = getAuthKeySignedMessageHash(
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

        await accountProxy.executeAuthKeyMetaTx(
          destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
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
    })
    context('Non-Happy Path', async () => {
      context('Bad Parameters', async () => {
        it('Should emit a CallFailed event due to failed transaction because of bad data', async () => {
          destination = badContract.address
          data = constants.BAD_DATA
          transactionDataSignature = getAuthKeySignedMessageHash(
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
          var { logs } = await accountProxy.executeAuthKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
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
          await accountProxy.executeAuthKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          nonce = await accountProxy.getNonce()
          transactionDataSignature = getAuthKeySignedMessageHash(
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
          var { logs } = await accountProxy.executeAuthKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
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
          transactionDataSignature = getAuthKeySignedMessageHash(
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
          await expectRevert.unspecified(accountProxy.executeAuthKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
          ))
        })
        // TODO: Currently failing due to inconsistent gasLimit values in the internal call
        it.skip('Should revert due to too low of a gasLimit sent with the transaction', async () => {
          gasLimit = 1
          transactionDataSignature = getAuthKeySignedMessageHash(
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

          var { logs } = await accountProxy.executeAuthKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
          )

          const failedTxHash = await getFailedTxHash(
            nonce,
            destination,
            value,
            data
          )
          expectEvent.inLogs(logs, 'CallFailed', { encodedData: failedTxHash })
        })
        it('Should fail to send a transaction due to a bad signed message', async () => {
          transactionDataSignature += 1
          await expectRevert(accountProxy.executeAuthKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice }
          ), "Auth key is invalid")
        })
        it('Should fail to fail to send a transaction due the relayer sending an incorrect gasPrice', async () => {
          await expectRevert(accountProxy.executeAuthKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: gasPrice + 1 }
          ), "Auth key is invalid")
        })
        it('Should not refund the relayer for InvalidAuthkey', async () => {
          const beforeProxyBalance = await balance.current(accountProxy.address)
          const beforeRelayerBalance = await balance.current(RELAYER)

          var badGasPrice = gasPrice + 1
          await expectRevert(accountProxy.executeAuthKeyMetaTx(
            destination, data, value, gasLimit, transactionDataSignature, { from: RELAYER, gasPrice: badGasPrice }
          ), "Auth key is invalid")

          const afterProxyBalance = await balance.current(accountProxy.address)
          const afterRelayerBalance = await balance.current(RELAYER)

          assert.equal(Number(beforeProxyBalance), Number(afterProxyBalance))
          assert.closeTo(Number(beforeRelayerBalance) - Number(afterRelayerBalance), 749660000092160, 100000000000000)
        })
      })
    })
  })
})
