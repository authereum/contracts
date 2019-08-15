const { TestHelper } = require('zos')
const { Contracts, ZWeb3 } = require('zos-lib')
const { expectEvent, expectRevert } = require('openzeppelin-test-helpers')

const { setENSDefaults } = require('../utils/utils')
const constants = require('../utils/constants.js')
const { advanceTime, advanceBlock, advanceTimeAndBlock }= require('../utils/time.js')

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
  })

  //* ********//
  //  Tests //
  //* ******//
  describe('changeDailyLimit', () => {
    context('Happy Path', async () => {
      it('Should allow an authkey to change the daily limit', async () => {
        var { logs } = await accountProxy.changeDailyLimit(10, { from: AUTH_KEYS[0] })
        expectEvent.inLogs(logs, 'DailyLimitChanged', { authKey: AUTH_KEYS[0], newDailyLimit: '10' })
        let dailyLimit = await accountProxy.dailyLimit()
        assert.equal(dailyLimit, '10')
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow a non-authkey to change the daily limit', async () => {
        await expectRevert(accountProxy.changeDailyLimit(10, { from: AUTH_KEYS[1] }), "Auth key is invalid")
      })
    })
  })
  describe('getCurrentDay', () => {
    context('Happy Path', async () => {
      it('Should get the current day', async () => {
        let day = await accountProxy.getCurrentDay({ from: AUTH_KEYS[0] })

        // Calculate current day
        let currentBlock = await web3.eth.getBlockNumber()
        let blockData = await web3.eth.getBlock(currentBlock)
        let currentDay = Math.floor(blockData.timestamp / 86400)
        
        assert.equal(Number(day), currentDay)
      })
      it('Should get the current day, advance a few seconds, and return the same day', async () => {
        let day = await accountProxy.getCurrentDay({ from: AUTH_KEYS[0] })

        // Calculate current day
        let currentBlock = await web3.eth.getBlockNumber()
        let blockData = await web3.eth.getBlock(currentBlock)
        let currentDay = Math.floor(blockData.timestamp / 86400)
        
        await advanceTime(2)
        let sameDay = await accountProxy.getCurrentDay({ from: AUTH_KEYS[0] })
        assert.equal(Number(day), currentDay)
        assert.equal(Number(sameDay), currentDay)
      })
      it('Should get the current day, advance a few days, and return the new day', async () => {
        let day = await accountProxy.getCurrentDay({ from: AUTH_KEYS[0] })

        // Calculate current day
        let currentBlock = await web3.eth.getBlockNumber()
        let blockData = await web3.eth.getBlock(currentBlock)
        let currentDay = Math.floor(blockData.timestamp / 86400)
        
        let numDaysToPass = 3
        let newDayTime = numDaysToPass * 86400
        await advanceTime(newDayTime)
        let newDay = await accountProxy.getCurrentDay({ from: AUTH_KEYS[0] })
        assert.equal(Number(day), currentDay)
        assert.equal(Number(newDay), currentDay + numDaysToPass)
      })
    })
  })
  describe('getIsWithinEthDailyTransactionLimit', () => {
    context('Happy Path', async () => {
      it('Should return true if a user is within their daily limits for the day', async () => {
        let isWithinEthDailyTransactionLimit = await accountProxy.getIsWithinEthDailyTransactionLimit.call()
        assert.equal(isWithinEthDailyTransactionLimit, true)
      })
    })
  })
  describe('getWillBeWithinEthDailyTransactionLimit', () => {
    context('Happy Path', async () => {
      it('Should return true if a user is within their daily limits for the day', async () => {
        let isWithinEthDailyTransactionLimit = await accountProxy.getWillBeWithinEthDailyTransactionLimit.call(constants.ONE_ETHER)
        assert.equal(isWithinEthDailyTransactionLimit, true)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should return false if a certain value will put a user out of their daily limit', async () => {
        let isWithinEthDailyTransactionLimit = await accountProxy.getWillBeWithinEthDailyTransactionLimit.call(constants.TWENTY_ETHER)
        assert.equal(isWithinEthDailyTransactionLimit, false)
      })
    })
  })
})
