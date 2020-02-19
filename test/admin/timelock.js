const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const TimelockContract = artifacts.require('Timelock')
const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')

contract('Timelock', function (accounts) {
  const OWNER = accounts[0]
  const ENS_OWNER = accounts[1]
  const AUTHEREUM_OWNER = accounts[2]
  const AUTH_KEYS = [accounts[3]]
  const RECEIVER = accounts[4]

  // Test Params
  let snapshotId

  // Parameters
  let label
  let expectedSalt
  let expectedCreationCodeHash
  let nonce
  let destination
  let value
  let data
  let gasPrice
  let gasLimit
  let transactionMessageHashSignature

  // Addresses
  let expectedAddress
  let expectedAddressWithUpgrade
  let expectedAddressWithUpgradeWithInit

  // Logic Addresses
  let authereumProxyFactoryLogicContract
  let authereumAccountLogicContract
  let authereumProxyAccountUpgradeLogicContract
  let authereumProxyAccountUpgradeWithInitLogicContract

  // Contract Instances
  let timelockInstance
  let authereumProxy
  let authereumProxyAccount
  let authereumProxyAccountUpgrade
  let authereumProxyAccountUpgradeWithInit

  before(async () => {
    // Set up ENS defaults
    const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumAccountLogicContract.address, authereumEnsManager.address)
    authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
    authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

    // Create default proxies
    label = constants.DEFAULT_LABEL
    expectedSalt = constants.SALT
    expectedCreationCodeHash = constants.AUTHEREUM_PROXY_CREATION_CODE_HASH

    expectedAddress = await utils.createDefaultProxy(
      expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
      AUTH_KEYS[0], label, authereumAccountLogicContract.address
    )

    // Wrap in truffle-contract
    badContract = await ArtifactBadTransaction.new()
    authereumProxy = await ArtifactAuthereumProxy.at(expectedAddress)
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)

    // Send relayer ETH to use as a transaction fee
    await authereumProxyAccount.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEYS[0] })

    nonce = await authereumProxyAccount.nonce()
    nonce = nonce.toNumber()

    // Transaction parameters
    nonce = 0
    destination = RECEIVER[0]
    value = constants.ONE_ETHER
    data = '0x00'

    timelockInstance = await TimelockContract.new(constants.ONE_MONTH, constants.ONE_WEEK)
  })

   // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot();
  });

  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result);
  });

  //* ********//
  //  Tests  //
  //* ******//
  describe('Constructor', () => {
    it('Should return the correct timelock time', async () => {
      const timelock = await timelockInstance.timelock.call()
      assert.equal(timelock, constants.ONE_MONTH)
    })
    it('Should return the correct timelockExpire time', async () => {
      const timelockExpire = await timelockInstance.timelockExpire.call()
      assert.equal(timelockExpire, constants.ONE_WEEK)
    })
  })
  describe('getUnlockTime', () => {
    it('Should return the correct timelock time for an uninitialized piece of data', async () => {
      const timelock = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      assert.equal(timelock, '0')
    })
    it('Should return the correct timelock time for an initialized piece of data', async () => {
      const currentBlock = await web3.eth.getBlock('latest')
      const expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH
      await timelockInstance.initiateChange(data, RECEIVER)
      const timelock = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      try {
        assert.equal(Number(timelock), expectedTimestamp)
      } catch {
        assert.equal(Number(timelock), expectedTimestamp + 1)
      }
    })
  })
  describe('getUnlockExpireTime', () => {
    it('Should return the correct expire timelock time for an uninitialized piece of data', async () => {
      const timelockExpire = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)
      assert.equal(timelockExpire, '0')
    })
    it('Should return the correct expire timelock time for an initialized piece of data', async () => {
      const currentBlock = await web3.eth.getBlock('latest')
      const expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + constants.ONE_WEEK
      await timelockInstance.initiateChange(data, RECEIVER)
      const timelockExpire = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)
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
      const remainingUnlockTime = await timelockInstance.getRemainingUnlockTime.call(data, RECEIVER)
      try {
        assert.equal(Number(remainingUnlockTime), constants.ONE_MONTH)
      } catch {
        try {
          assert.equal(Number(remainingUnlockTime), constants.ONE_MONTH + 1)
        } catch {
          assert.equal(Number(remainingUnlockTime), constants.ONE_MONTH + 2)
        }
      }
    })
    it('Should return the half unlock time', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await timeUtils.increaseTime(constants.ONE_MONTH / 2)
      const remainingUnlockTime = await timelockInstance.getRemainingUnlockTime.call(data, RECEIVER)
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
      await timeUtils.increaseTime(constants.ONE_MONTH * 2)
      const remainingUnlockTime = await timelockInstance.getRemainingUnlockTime.call(data, RECEIVER)
      assert.equal(Number(remainingUnlockTime), 0)
    })
    it('Should return 0 for the unlock time since it has not yet been initiated', async () => {
      const remainingUnlockTime = await timelockInstance.getRemainingUnlockTime.call(data, RECEIVER)
      assert.equal(Number(remainingUnlockTime), 0)
    })
  })
  describe('getRemainingUnlockExpireTime', () => {
    it('Should return the entire unlock expire time', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      const remainingUnlockExpireTime = await timelockInstance.getRemainingUnlockExpireTime.call(data, RECEIVER)
      try {
        assert.equal(Number(remainingUnlockExpireTime), constants.ONE_MONTH)
      } catch {
        assert.equal(Number(remainingUnlockExpireTime), constants.ONE_MONTH + 1)
      }
    })
    it('Should return the unlock expire time after a month', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await timeUtils.increaseTime(constants.ONE_MONTH / 2)
      const remainingUnlockExpireTime = await timelockInstance.getRemainingUnlockExpireTime.call(data, RECEIVER)
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
      await timeUtils.increaseTime(constants.ONE_MONTH * 2)
      const remainingUnlockExpireTime = await timelockInstance.getRemainingUnlockExpireTime.call(data, RECEIVER)
      assert.equal(Number(remainingUnlockExpireTime), 0)
    })
    it('Should return 0 for the unlock expire time since it has not yet been initiated', async () => {
      const remainingUnlockExpireTime = await timelockInstance.getRemainingUnlockExpireTime.call(data, RECEIVER)
      assert.equal(Number(remainingUnlockExpireTime), 0)
    })
  })
  describe('getCurrentChangeState', () => {
    it('Should return the correct changeState for an uninitialized piece of data', async () => {
      const changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '0')
    })
    it('Should return the correct changeState for a pending piece of data', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      const changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '1')
    })
    it('Should return the correct changeState for a changeable piece of data', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await timeUtils.increaseTime(constants.ONE_MONTH + 1)
      const changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '2')
    })
    it('Should return the correct changeState for an expired piece of data', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await timeUtils.increaseTime(constants.ONE_MONTH + constants.ONE_WEEK + 1)
      const changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '3')
    })
  })
  describe('setTimelock', () => {
    it('Should set the timelock from a change process', async () => {
      const expectedNewTimelock = constants.ONE_DAY
      const expectedNewData = web3.eth.abi.encodeFunctionCall({
          name: 'setTimelock',
          type: 'function',
          inputs: [{
              type: 'uint256',
              name: '_timelock'
          }]
      }, [expectedNewTimelock.toString()]);


      // Execute the change
      await timelockInstance.initiateChange(expectedNewData, timelockInstance.address)
      await timeUtils.increaseTime(constants.ONE_MONTH + 1)
      await timelockInstance.executeChange(expectedNewData, timelockInstance.address)

      // Check the new timelock
      const newTimelock = await timelockInstance.timelock.call()
      assert.equal(Number(newTimelock), expectedNewTimelock)
    })
    it('Should not let the owner call this funciton directly', async () => {
      await expectRevert(timelockInstance.setTimelock(1), constants.REVERT_MSG.T_REQUIRE_TIMELOCK_CONTRACT)
    })
    it('Should not let anyone call this funciton directly', async () => {
      await expectRevert(timelockInstance.setTimelock(1, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.T_REQUIRE_TIMELOCK_CONTRACT)
    })
  })
  describe('setTimelockExpire', () => {
    it('Should set the timelock from a change process', async () => {
      const expectedNewTimelockExpire = constants.ONE_DAY
      const expectedNewData = web3.eth.abi.encodeFunctionCall({
          name: 'setTimelockExpire',
          type: 'function',
          inputs: [{
              type: 'uint256',
              name: '_timelock'
          }]
      }, [expectedNewTimelockExpire.toString()]);


      // Execute the change
      await timelockInstance.initiateChange(expectedNewData, timelockInstance.address)
      await timeUtils.increaseTime(constants.ONE_MONTH + 1)
      await timelockInstance.executeChange(expectedNewData, timelockInstance.address)

      // Check the new timelock
      const newTimelockExpire = await timelockInstance.timelockExpire.call()
      assert.equal(Number(newTimelockExpire), expectedNewTimelockExpire)
    })
    it('Should not let the owner call this funciton directly', async () => {
      await expectRevert(timelockInstance.setTimelockExpire(1), constants.REVERT_MSG.T_REQUIRE_TIMELOCK_CONTRACT)
    })
    it('Should not let anyone call this funciton directly', async () => {
      await expectRevert(timelockInstance.setTimelockExpire(1, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.T_REQUIRE_TIMELOCK_CONTRACT)
    })
  })
  describe('initiateChange', () => {
    it('Should set the state of a change to pending, set the unlock time to a month from now, set the unlock expire time to one month + one week from now, and trigger an event', async () => {
      var { logs } = await timelockInstance.initiateChange(data, RECEIVER)
      const currentBlock = await web3.eth.getBlock('latest')
      const currentTimestamp = currentBlock.timestamp.toString()
      expectEvent.inLogs(logs, 'ChangeInitiated', {data: data, changeAddress: RECEIVER, changeTime: currentTimestamp})

      // Check states
      const changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '1')

      const unlockTime = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      const unlockExpireTime = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)

      const expectedUnlockTime = parseInt(currentTimestamp) + constants.ONE_MONTH
      const expectedUnlockExpireTime = parseInt(currentTimestamp) + constants.ONE_MONTH + constants.ONE_WEEK

      assert.equal(unlockTime, expectedUnlockTime.toString())
      assert.equal(unlockExpireTime, expectedUnlockExpireTime.toString())
    })
    it('Should not allow an non-uninitialized data and address combination to be initialized', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await expectRevert(timelockInstance.initiateChange(data, RECEIVER), constants.REVERT_MSG.T_TIMELOCK_NOT_ABLE_TO_INITIATE_CHANGE)
    })
  })
  describe('executeChange', () => {
    it('Should execute the change, reset the state of the data and address pair to uninitialized, and emit an event', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      const currentBlock = await web3.eth.getBlock('latest')
      const expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + 1
      await timeUtils.increaseTime(constants.ONE_MONTH + 1)

      var { logs } = await timelockInstance.executeChange(data, RECEIVER)

      // Check that data and address pair have been reset
      const unlockTime = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      const unlockExpireTime = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)
      const changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)

      assert.equal(unlockTime, '0')
      assert.equal(unlockExpireTime, '0')
      assert.equal(changeState, '0')

      // Check the logs
      try {
        expectEvent.inLogs(logs, 'ChangeExecuted', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString()
        })
      } catch {
        expectEvent.inLogs(logs, 'ChangeExecuted', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString()
        })
      }
    })
    it('Should execute the change that sets a new timelock and sends 0.1 ETH to the receiving', async () => {
      const beforeBalance = await web3.eth.getBalance(RECEIVER)
      await timelockInstance.initiateChange(data, RECEIVER)
      const currentBlock = await web3.eth.getBlock('latest')
      const expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + 1
      await timeUtils.increaseTime(constants.ONE_MONTH + 1)

      const pointOneEth= constants.ONE_ETHER / 10
      var { logs } = await timelockInstance.executeChange(data, RECEIVER, { value: pointOneEth })

      // Check that data and address pair have been reset
      const unlockTime = await timelockInstance.getUnlockTime.call(data, RECEIVER)
      const unlockExpireTime = await timelockInstance.getUnlockExpireTime.call(data, RECEIVER)
      const changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)

      assert.equal(unlockTime, '0')
      assert.equal(unlockExpireTime, '0')
      assert.equal(changeState, '0')

      // Check the logs
      try {
        expectEvent.inLogs(logs, 'ChangeExecuted', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString()
        })
      } catch {
        expectEvent.inLogs(logs, 'ChangeExecuted', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString()
        })
      }

      // Check the balance
      const afterBalance = await web3.eth.getBalance(RECEIVER)
      assert.equal(afterBalance - beforeBalance, pointOneEth)
    })
    it('Should not execute the change due to the change still being in a pending state', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await timeUtils.increaseTime(constants.ONE_MONTH - 2)
      await expectRevert(timelockInstance.executeChange(data, RECEIVER), constants.REVERT_MSG.T_TIMELOCK_NOT_ABLE_TO_CHANGE)
    })
    it('Should not execute the change due to the change already being made', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      await timeUtils.increaseTime(constants.ONE_MONTH + 1)
      await timelockInstance.executeChange(data, RECEIVER)
      await expectRevert(timelockInstance.executeChange(data, RECEIVER), constants.REVERT_MSG.T_TIMELOCK_NOT_ABLE_TO_CHANGE)
    })
  })
  describe('cancelChange', () => {
    it('Should cancel a pending change', async () => {
      const currentBlock = await web3.eth.getBlock('latest')
      const expectedTimestamp = currentBlock.timestamp
      await timelockInstance.initiateChange(data, RECEIVER)

      // Check the state
      let changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '1')

      // Check the logs
      var { logs } = await timelockInstance.cancelChange(data, RECEIVER)

      // Check the state
      changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '0')

      try {
        expectEvent.inLogs(logs, 'ChangeCancelled', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp).toString()
        })
      } catch {
        try {
          expectEvent.inLogs(logs, 'ChangeCancelled', {
            data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 2).toString()
          })
        } catch {
          expectEvent.inLogs(logs, 'ChangeCancelled', {
            data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 3).toString()
          })
        }
      }
    })
    it('Should cancel a changeable change', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      const currentBlock = await web3.eth.getBlock('latest')
      const expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + 1
      await timeUtils.increaseTime(constants.ONE_MONTH + 1)

      // Check state
      let changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '2')

      await timelockInstance.executeChange(data, RECEIVER)

      // Check state
      changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '0')

      // Check the logs
      var { logs } = await timelockInstance.cancelChange(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'ChangeCancelled', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString()
        })
      } catch {
        expectEvent.inLogs(logs, 'ChangeCancelled', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString()
        })
      }
    })
    it('Should cancel an expired change', async () => {
      await timelockInstance.initiateChange(data, RECEIVER)
      const currentBlock = await web3.eth.getBlock('latest')
      const expectedTimestamp = currentBlock.timestamp + constants.ONE_MONTH + constants.ONE_MONTH
      await timeUtils.increaseTime(constants.ONE_MONTH + constants.ONE_MONTH)

      // Check state
      const changeState = await timelockInstance.getCurrentChangeState.call(data, RECEIVER)
      assert.equal(changeState, '3')

      // Check the logs
      var { logs } = await timelockInstance.cancelChange(data, RECEIVER)
      try {
        expectEvent.inLogs(logs, 'ChangeCancelled', {
          data: data, changeAddress: RECEIVER, changeTime: expectedTimestamp.toString()
        })
      } catch {
        await expectEvent.inLogs(logs, 'ChangeCancelled', {
          data: data, changeAddress: RECEIVER, changeTime: (expectedTimestamp + 1).toString()
        })
      }
    })
  })
})
