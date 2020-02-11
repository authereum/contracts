// const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

// const utils = require('../utils/utils')
// const constants = require('../utils/constants.js')
// const timeUtils = require('../utils/time.js')

// const ArtifactBadTransaction = artifacts.require('BadTransaction')
// const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
// const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
// const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
// const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
// const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')
// const AuthereumEnsResolver = artifacts.require('AuthereumEnsResolver')
// const AuthereumEnsManager = artifacts.require('AuthereumEnsManager')

// contract('TransactionLimit', function (accounts) {
//   const OWNER = accounts[0]
//   const RELAYER = accounts[9]
//   const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6]]
//   const RECEIVERS = [accounts[7]]
//   const ENS_OWNER = accounts[8]
//   const AUTHEREUM_OWNER = accounts[9]
//   const LOGIN_KEY = accounts[10]

//   // Test Params
//   let snapshotId

//   // Parameters
//   let label
//   let expectedSalt
//   let expectedCreationCodeHash
//   let nonce
//   let destination
//   let value
//   let data
//   let gasPrice
//   let gasLimit
//   let transactionMessageHashSignature

//   // Addresses
//   let expectedAddress
//   let expectedAddressWithUpgrade
//   let expectedAddressWithUpgradeWithInit

//   // Logic Addresses
//   let authereumProxyFactoryLogicContract
//   let authereumAccountLogicContract
//   let authereumProxyAccountUpgradeLogicContract
//   let authereumProxyAccountUpgradeWithInitLogicContract

//   // Contract Instances
//   let authereumProxy
//   let authereumProxyAccount
//   let authereumProxyAccountUpgrade
//   let authereumProxyAccountUpgradeWithInit

//   before(async () => {
//     // Set up ENS defaults
//     const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

//     // Create Logic Contracts
//     authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
//     authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumAccountLogicContract.address, authereumEnsManager.address)
//     authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
//     authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()

//     // Set up Authereum ENS Manager defaults
//     await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)
    
//     // Create default proxies
//     label = constants.DEFAULT_LABEL
//     expectedSalt = constants.SALT
//     expectedCreationCodeHash = constants.AUTHEREUM_PROXY_CREATION_CODE_HASH

//     expectedAddress = await utils.createDefaultProxy(
//       expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
//       AUTH_KEYS[0], label, authereumAccountLogicContract.address
//     )

//     // Wrap in truffle-contract
//     badContract = await ArtifactBadTransaction.new()
//     authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
//     authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

//     // Send relayer ETH to use as a transaction fee
//     await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })
  
//     nonce = await authereumProxyAccount.nonce()
//     nonce = nonce.toNumber()

//     // Transaction parameters
//     nonce = 0
//     destination = RECEIVERS[0]
//     value = constants.ONE_ETHER
//     data = '0x00'
//   })

//   // Take snapshot before each test and revert after each test
//   beforeEach(async() => {
//     snapshotId = await timeUtils.takeSnapshot();
//   });
 
//   afterEach(async() => {
//     await timeUtils.revertSnapshot(snapshotId.result);
//   });

//   //**********//
//   //  Tests  //
//   //********//

//   describe('changeDailyLimit', () => {
//     context('Happy Path', async () => {
//       it('Should allow an authkey to change the daily limit', async () => {
//         var { logs } = await authereumProxyAccount.changeDailyLimit(10, { from: AUTH_KEYS[0] })
//         expectEvent.inLogs(logs, 'DailyLimitChanged', { authKey: AUTH_KEYS[0], newDailyLimit: '10' })
//         const dailyLimit = await authereumProxyAccount.dailyLimit()
//         assert.equal(dailyLimit, '10')
//       })
//     })
//     context('Non-Happy Path', async () => {
//       it('Should not allow a non-authkey to change the daily limit', async () => {
//         await expectRevert(authereumProxyAccount.changeDailyLimit(10, { from: AUTH_KEYS[1] }), constants.REVERT_MSG.AUTH_KEY_INVALID)
//       })
//     })
//   })
//   describe('getCurrentDay', () => {
//     context('Happy Path', async () => {
//       it('Should get the current day', async () => {
//         const day = await authereumProxyAccount.getCurrentDay({ from: AUTH_KEYS[0] })

//         // Calculate current day
//         const currentBlock = await web3.eth.getBlockNumber()
//         const blockData = await web3.eth.getBlock(currentBlock)
//         const currentDay = Math.floor(blockData.timestamp / 86400)
        
//         assert.equal(Number(day), currentDay)
//       })
//       it('Should get the current day, advance a few seconds, and return the same day', async () => {
//         const day = await authereumProxyAccount.getCurrentDay({ from: AUTH_KEYS[0] })

//         // Calculate current day
//         const currentBlock = await web3.eth.getBlockNumber()
//         const blockData = await web3.eth.getBlock(currentBlock)
//         const currentDay = Math.floor(blockData.timestamp / 86400)
        
//         await timeUtils.increaseTime(2)
//         const sameDay = await authereumProxyAccount.getCurrentDay({ from: AUTH_KEYS[0] })
//         assert.equal(Number(day), currentDay)
//         assert.equal(Number(sameDay), currentDay)
//       })
//       it.skip('Should get the current day, advance a few days, and return the new day', async () => {
//         const day = await authereumProxyAccount.getCurrentDay({ from: AUTH_KEYS[0] })

//         // Calculate current day
//         const currentBlock = await web3.eth.getBlockNumber()
//         const blockData = await web3.eth.getBlock(currentBlock)
//         const currentDay = Math.floor(blockData.timestamp / 86400)
        
//         const numDaysToPass = 3
//         const newDayTime = numDaysToPass * 86400
//         await timeUtils.increaseTime(newDayTime)
//         const newDay = await authereumProxyAccount.getCurrentDay({ from: AUTH_KEYS[0] })
//         assert.equal(Number(day), currentDay)
//         assert.equal(Number(newDay), currentDay + numDaysToPass)
//       })
//     })
//   })
//   describe('getIsWithinEthDailyTransactionLimit', () => {
//     context('Happy Path', async () => {
//       it('Should return true if a user is within their daily limits for the day', async () => {
//         const isWithinEthDailyTransactionLimit = await authereumProxyAccount.getIsWithinEthDailyTransactionLimit.call()
//         assert.equal(isWithinEthDailyTransactionLimit, true)
//       })
//     })
//   })
//   describe('getWillBeWithinEthDailyTransactionLimit', () => {
//     context('Happy Path', async () => {
//       it('Should return true if a user is within their daily limits for the day', async () => {
//         const isWithinEthDailyTransactionLimit = await authereumProxyAccount.getWillBeWithinEthDailyTransactionLimit.call(constants.ONE_ETHER)
//         assert.equal(isWithinEthDailyTransactionLimit, true)
//       })
//     })
//     context('Non-Happy Path', async () => {
//       it('Should return false if a certain value will put a user out of their daily limit', async () => {
//         const isWithinEthDailyTransactionLimit = await authereumProxyAccount.getWillBeWithinEthDailyTransactionLimit.call(constants.TWENTY_ETHER)
//         assert.equal(isWithinEthDailyTransactionLimit, false)
//       })
//     })
//   })
// })
