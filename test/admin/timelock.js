const { TestHelper } = require('zos')
const { Contracts, ZWeb3 } = require('zos-lib')
const { expectEvent, expectRevert, time } = require('openzeppelin-test-helpers')

const { setENSDefaults } = require('../utils/utils')
const constants = require('../utils/constants.js')
const { advanceTime, advanceBlock, advanceTimeAndBlock }= require('../utils/time.js')

ZWeb3.initialize(web3.currentProvider)

const TimelockContract = artifacts.require('Timelock')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactBadTransaction = artifacts.require('BadTransaction')
const AuthereumAccount = Contracts.getFromLocal('AuthereumAccount')

contract('Account', function (accounts) {
  const OWNER = accounts[0]
  const ENS_OWNER = accounts[1]
  const AUTHEREUM_OWNER = accounts[2]
  const AUTH_KEYS = [accounts[3]]
  const RECEIVER = accounts[4]

  // Params
  let badContract
  let accountProxy
  let timelockInstance
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

    timelockInstance = await TimelockContract.new(constants.ONE_MONTH, constants.ONE_WEEK)
    // Transaction parameters
    nonce = 0
    destination = RECEIVER
    value = constants.ONE_ETHER
    data = '0x00'

  })

  //* ********//
  //  Tests  //
  //* ******//
  describe('Constructor', () => {
    it('Should return the correct timelock time', async () => {
      var timelock = await timelockInstance.timelock.call()
      assert.equal(timelock, constants.ONE_MONTH)
    })
    it('Should return the correct timelockExpire time', async () => {
      var timelockExpire = await timelockInstance.timelockExpire.call()
      assert.equal(timelockExpire, constants.ONE_WEEK)
    })
  })
  describe('getUnlockTime', () => {
    it('Should return the correct timelock time for an uninitialized piece of data', async () => {
      var timelock = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      assert.equal(timelock, '0')
    })
    it('Should return the correct timelock time for an initialized piece of data', async () => {
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH
      await timelockInstance.initiateChange(data, RECEIVER)
      var timelock = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      try {
        assert.equal(Number(timelock), expectedTimestamp)
      } catch {
        assert.equal(Number(timelock), expectedTimestamp + 1)
      }
    })
  })
  describe('getUnlockExpireTime', () => {
    it('Should return the correct expire timelock time for an uninitialized piece of data', async () => {
      var timelockExpire = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)
      assert.equal(timelockExpire, '0')
    })
    it('Should return the correct expire timelock time for an initialized piece of data', async () => {
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + constants.ONE_WEEK
      await timelockInstance.initiateChange(data, RECEIVER)
      var timelockExpire = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)
      try {
        assert.equal(Number(timelockExpire), expectedTimestamp)
      } catch {
        assert.equal(Number(timelockExpire), expectedTimestamp + 1)
      }
    })
  })
  describe('getRemainingUnlockTime', () => {
    it('Should return the entire unlock time', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var remainingUnlockTime = await timelockInstance.getRemainingUnlockTime.call(data, RECEIVER)
      try {
        assert.equal(Number(remainingUnlockTime), constants.ONE_MONTH)
      } catch {
        assert.equal(Number(remainingUnlockTime), constants.ONE_MONTH + 1)
      }
    })
    it('Should return the half unlock time', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await advanceTime(constants.ONE_MONTH / 2)
      var remainingUnlockTime = await timelockInstance.getRemainingUnlockTime.call(data, RECEIVER)
      try {
        assert.equal(Number(remainingUnlockTime), (constants.ONE_MONTH / 2 - 1))
      } catch {
        try {
          assert.equal(Number(remainingUnlockTime), (constants.ONE_MONTH / 2))
        } catch {
          assert.equal(Number(remainingUnlockTime), (constants.ONE_MONTH / 2) + 1)
        }
      }
    })
    it('Should return 0 for the unlock time since it has already passed', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await advanceTime(constants.ONE_MONTH * 2)
      var remainingUnlockTime = await timelockInstance.getRemainingUnlockTime.call(data, RECEIVER)
      assert.equal(Number(remainingUnlockTime), 0)
    })
    it('Should return 0 for the unlock time since it has not yet been initiated', async () => {
      var remainingUnlockTime = await timelockInstance.getRemainingUnlockTime.call(data, RECEIVER)
      assert.equal(Number(remainingUnlockTime), 0)
    })
  })
  describe('getRemainingUnlockExpireTime', () => {
    it('Should return the entire unlock expire time', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var remainingUnlockExpireTime = await timelockInstance.getRemainingUnlockExpireTime.call(data, RECEIVER)
      try {
        assert.equal(Number(remainingUnlockExpireTime), constants.ONE_MONTH)
      } catch {
        assert.equal(Number(remainingUnlockExpireTime), constants.ONE_MONTH + 1)
      }
    })
    it('Should return the unlock expire time after a month', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await advanceTime(constants.ONE_MONTH / 2)
      var remainingUnlockExpireTime = await timelockInstance.getRemainingUnlockExpireTime.call(data, RECEIVER)
      try {
        assert.equal(Number(remainingUnlockExpireTime), (constants.ONE_MONTH / 2 - 1))
      } catch {
        try {
          assert.equal(Number(remainingUnlockExpireTime), (constants.ONE_MONTH / 2 ))
        } catch {
          assert.equal(Number(remainingUnlockExpireTime), (constants.ONE_MONTH / 2 + 1))
        }
      }
    })
    it('Should return 0 for the unlock expire time since it has already passed', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await advanceTime(constants.ONE_MONTH * 2)
      var remainingUnlockExpireTime = await timelockInstance.getRemainingUnlockExpireTime.call(data, RECEIVER)
      assert.equal(Number(remainingUnlockExpireTime), 0)
    })
    it('Should return 0 for the unlock expire time since it has not yet been initiated', async () => {
      var remainingUnlockExpireTime = await timelockInstance.getRemainingUnlockExpireTime.call(data, RECEIVER)
      assert.equal(Number(remainingUnlockExpireTime), 0)
    })
  })
  describe('getCurrentChangeState', () => {
    it('Should return the correct changeState for an uninitialized piece of data', async () => {
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '0')
    })
    it('Should return the correct changeState for a pending piece of data', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      await timelockInstance.setCurrentChangeState(data, RECEIVER)
      assert.equal(changeState, '1')
    })
    it('Should return the correct changeState for a changeable piece of data', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await advanceTime(constants.ONE_MONTH + 1)
      await timelockInstance.setCurrentChangeState(data, RECEIVER)
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '2')
    })
    it('Should return the correct changeState for an expired piece of data', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await advanceTime(constants.ONE_MONTH + constants.ONE_WEEK + 1)
      await timelockInstance.setCurrentChangeState(data, RECEIVER)
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '3')
    })
  })
  describe('setTimelock', () => {
    it('Should set the timelock from a change process', async () => {
      var expectedNewTimelock = constants.ONE_DAY
      var expectedNewData = web3.eth.abi.encodeFunctionCall({
          name: 'setTimelock',
          type: 'function',
          inputs: [{
              type: 'uint256',
              name: '_timelock'
          }]
      }, [expectedNewTimelock.toString()]);
    

      // Make the change
      await timelockInstance.initiateChange(expectedNewData, timelockInstance.address)
      await advanceTime(constants.ONE_MONTH + 1)
      await timelockInstance.makeChange(expectedNewData, timelockInstance.address)

      // Check the new timelock
      var newTimelock = await timelockInstance.timelock.call()
      assert.equal(Number(newTimelock), expectedNewTimelock)
    })
    it('Should not let the owner call this funciton directly', async () => {
      await expectRevert(timelockInstance.setTimelock(1), "Only this contract can call this function")
    })
    it('Should not let anyone call this funciton directly', async () => {
      await expectRevert(timelockInstance.setTimelock(1, { from: AUTH_KEYS[0] }), "Only this contract can call this function")
    })
  })
  describe('setTimelockExpire', () => {
    it('Should set the timelock from a change process', async () => {
      var expectedNewTimelockExpire = constants.ONE_DAY
      var expectedNewData = web3.eth.abi.encodeFunctionCall({
          name: 'setTimelockExpire',
          type: 'function',
          inputs: [{
              type: 'uint256',
              name: '_timelock'
          }]
      }, [expectedNewTimelockExpire.toString()]);
    

      // Make the change
      await timelockInstance.initiateChange(expectedNewData, timelockInstance.address)
      await advanceTime(constants.ONE_MONTH + 1)
      await timelockInstance.makeChange(expectedNewData, timelockInstance.address)

      // Check the new timelock
      var newTimelockExpire = await timelockInstance.timelockExpire.call()
      assert.equal(Number(newTimelockExpire), expectedNewTimelockExpire)
    })
    it('Should not let the owner call this funciton directly', async () => {
      await expectRevert(timelockInstance.setTimelockExpire(1), "Only this contract can call this function")
    })
    it('Should not let anyone call this funciton directly', async () => {
      await expectRevert(timelockInstance.setTimelockExpire(1, { from: AUTH_KEYS[0] }), "Only this contract can call this function")
    })
  })
  describe('setCurrentChangeState', () => {
    it('Should update the state to uninitialized due to the time being within the uninitialized window', async () => {
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp 

      // Check the logs
      var { logs } = await timelockInstance.setCurrentChangeState(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "0"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "0"
        })
      }
    })
    it('Should update the state to pending due to the time being within the pending window', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + 1
      await advanceTime(1)

      // Check the logs
      var { logs } = await timelockInstance.setCurrentChangeState(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "1"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "1"
        })
      }
    })
    it('Should update the state to changeable due to the time being exactly at the start of the changeable window', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH
      await advanceTime(constants.ONE_MONTH)

      // Check the logs
      var { logs } = await timelockInstance.setCurrentChangeState(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "2"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "2"
        })
      }
    })
    it('Should update the state to changeable due to the time being within the changeable window', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + 1
      await advanceTime(constants.ONE_MONTH + 1)

      // Check the logs
      var { logs } = await timelockInstance.setCurrentChangeState(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "2"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "2"
        })
      }
    })
    it('Should update the state to expired due to the time being exactly on the expiration time', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + constants.ONE_WEEK
      await advanceTime(constants.ONE_MONTH + constants.ONE_WEEK)

      // Check the logs
      var { logs } = await timelockInstance.setCurrentChangeState(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "3"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "3"
        })
      }
    })
    it('Should update the state to expired due to the time being past the expiration time', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + constants.ONE_MONTH
      await advanceTime(constants.ONE_MONTH + constants.ONE_MONTH)

      // Check the logs
      var { logs } = await timelockInstance.setCurrentChangeState(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "3"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "3"
        })
      }
    })
  })
  describe('initiateChange', () => {
    it('Should set the state of a change to pending, set the unlock time to a month from now, set the unlock expire time to one month + one week from now, and trigger an event', async () => {
      var { logs } = await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var currentTimestamp = currentBlock.timestamp.toString()
      expectEvent.inLogs(logs, 'StateUpdate', {data: data, changeAddress: RECEIVER, changeTime: currentTimestamp, state: "1"})

      // Check states
      var unlockTime = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      var unlockExpireTime = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)

      var expectedUnlockTime = parseInt(currentTimestamp) + constants.ONE_MONTH
      var expectedUnlockExpireTime = parseInt(currentTimestamp) + constants.ONE_MONTH + constants.ONE_WEEK

      assert.equal(unlockTime, expectedUnlockTime.toString())
      assert.equal(unlockExpireTime, expectedUnlockExpireTime.toString())
    })
    it('Should not allow an non-uninitialized data and address combination to be initialized', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await expectRevert(timelockInstance.initiateChange(data, RECEIVER), "Change not able to be initiated")
    })
  })
  describe('makeChange', () => {
    it('Should make the change, reset the state of the data and address pair to uninitialized, and emit an event', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + 1
      await advanceTime(constants.ONE_MONTH + 1)

      var { logs } = await timelockInstance.makeChange(data, RECEIVER)

      // Check that data and address pair have been reset
      var unlockTime = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      var unlockExpireTime = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)

      assert.equal(unlockTime, '0')
      assert.equal(unlockExpireTime, '0')
      assert.equal(changeState, '0')

      // Check the logs
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "2"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "2"
        })
      }
    })
    it('Should make the change that sets a new timelock and sends 0.1 ETH to the receiving', async () => {
      var beforeBalance = await web3.eth.getBalance(RECEIVER)
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + 1
      await advanceTime(constants.ONE_MONTH + 1)

      var pointOneEth= constants.ONE_ETHER / 10
      var { logs } = await timelockInstance.makeChange(data, RECEIVER, { value: pointOneEth })

      // Check that data and address pair have been reset
      var unlockTime = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      var unlockExpireTime = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)

      assert.equal(unlockTime, '0')
      assert.equal(unlockExpireTime, '0')
      assert.equal(changeState, '0')

      // Check the logs
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "2"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "2"
        })
      }

      // Check the balance
      var afterBalance = await web3.eth.getBalance(RECEIVER)
      assert.equal(afterBalance - beforeBalance, pointOneEth)
    })
    it('Should not make the change due to the change still being in a pending state', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await advanceTime(constants.ONE_MONTH - 2)
      await expectRevert(timelockInstance.makeChange(data, RECEIVER), "Change not able to be made")
    })
    it('Should not make the change due to the change already being made', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await advanceTime(constants.ONE_MONTH + 1)
      await timelockInstance.makeChange(data, RECEIVER)
      await expectRevert(timelockInstance.makeChange(data, RECEIVER), "Change not able to be made")
    })
  })
  describe('cancelChange', () => {
    it('Should cancel a pending change', async () => {
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp
      await timelockInstance.initiateChange(data, RECEIVER)

      // Check the state
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '1')

      // Check the logs
      var { logs } = await timelockInstance.cancelChange(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "0"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "0"
        })
      }
    })
    it('Should cancel a changeable change', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + 1
      await advanceTime(constants.ONE_MONTH + 1)

      // Set and check state
      await timelockInstance.setCurrentChangeState(data, RECEIVER)
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '2')

      await timelockInstance.makeChange(data, RECEIVER)
      
      // Check state
      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '0')

      // Check the logs
      var { logs } = await timelockInstance.cancelChange(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "0"
        })
      } catch {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "0"
        })
      }
    })
    it('Should cancel an expired change', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      var currentBlock = await web3.eth.getBlock("latest")
      var expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + constants.ONE_MONTH
      await advanceTime(constants.ONE_MONTH + constants.ONE_MONTH)

      // Set and check state
      await timelockInstance.setCurrentChangeState(data, RECEIVER)


      var changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '3')
      
      // Check the logs
      var { logs } = await timelockInstance.cancelChange(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString(), state: "0"
        })
      } catch {
        await expectEvent.inLogs(logs, 'StateUpdate', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString(), state: "0"
        })
      }
    })
  })
})
