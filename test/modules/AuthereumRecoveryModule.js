const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers')
const constants = require('../utils/constants.js')
const utils = require('../utils/utils')
const timeUtils = require('../utils/time.js')

const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')

const GAS_LIMIT = 1000000
const RECOVERY_DELAY = 100

contract('AuthereumRecoveryModule', function (accounts) {
  let beforeAllSnapshotId
  let snapshotId

  const AUTHEREUM_OWNER = accounts[0]
  const AUTH_KEY = accounts[1]
  const NEW_AUTH_KEY = accounts[2]
  const NEW_AUTH_KEY_2 = accounts[3]
  const RECOVERY_ADDRESS = accounts[4]
  const ATTACKER_ADDRESS = accounts[5]

  let accountContract, authereumRecoveryModule
  let erc1820Registry

  before(async () => {
    // Take snapshot to reset to a known state
    // This is required due to the deployment of the 1820 contract
    beforeAllSnapshotId = await timeUtils.takeSnapshot()

    // Deploy the recovery module
    authereumRecoveryModule = await ArtifactAuthereumRecoveryModule.new()

    // Deploy the 1820 contract
    await utils.deploy1820Contract(AUTHEREUM_OWNER)

    // Set up ENS defaults
    const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Message signature
    MSG_SIG = await utils.getexecuteMultipleAuthKeyMetaTransactionsSig('2020021700')

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumAccountLogicContract.address, authereumEnsManager.address)

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

    // Create default proxies
    label = constants.DEFAULT_LABEL
    expectedSalt = constants.SALT
    expectedCreationCodeHash = constants.AUTHEREUM_PROXY_CREATION_CODE_HASH

    expectedAddress = await utils.createDefaultProxy(
      expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
      AUTH_KEY, label, authereumAccountLogicContract.address
    )

    // Set up IERC1820 contract
    erc1820Registry = await ArtifactERC1820Registry.at(constants.ERC1820_REGISTRY_ADDRESS)

    // Wrap in truffle-contract
    accountContract = await ArtifactAuthereumAccount.at(expectedAddress)

    // Handle post-proxy deployment
    await accountContract.sendTransaction({ value:constants.TWO_ETHER, from: AUTH_KEY })
    await utils.setAuthereumRecoveryModule(accountContract, authereumRecoveryModule.address, AUTH_KEY)
    await utils.setAccountIn1820Registry(accountContract, erc1820Registry.address, AUTH_KEY)
  })

  after(async() => {
    await timeUtils.revertSnapshot(beforeAllSnapshotId.result)
  })

  // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot()
  })

  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result)
  })

  describe('name', () => {
    context('Happy path', () => {
      it('Should return the name of the contract', async () => {
        const _name = await authereumRecoveryModule.name.call()
        assert.equal(_name, constants.CONTRACT_NAMES.RECOVERY_MODULE)
      })
    })
  })
  context('Happy path', () => {
    it('Should allow recovery address to recover account', async () => {
      await addRecoveryAccount(RECOVERY_ADDRESS)
      await authereumRecoveryModule.startRecovery(
        accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
      )

      await timeUtils.increaseTime(RECOVERY_DELAY + 1)

      await expectAuthKey(NEW_AUTH_KEY, false)

      await authereumRecoveryModule.completeRecovery(
        accountContract.address, RECOVERY_ADDRESS
      )

      await expectAuthKey(NEW_AUTH_KEY, true)
    })

    it('Should allow recovery address to recover account a second time', async () => {
      await addRecoveryAccount(RECOVERY_ADDRESS)
      await authereumRecoveryModule.startRecovery(
        accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
      )

      await timeUtils.increaseTime(RECOVERY_DELAY + 1)

      await expectAuthKey(NEW_AUTH_KEY, false)

      await authereumRecoveryModule.completeRecovery(
        accountContract.address, RECOVERY_ADDRESS
      )

      await expectAuthKey(NEW_AUTH_KEY, true)

      // Second recovery
      await authereumRecoveryModule.startRecovery(
        accountContract.address, NEW_AUTH_KEY_2, { from: RECOVERY_ADDRESS }
      )

      await timeUtils.increaseTime(RECOVERY_DELAY + 1)

      await expectAuthKey(NEW_AUTH_KEY_2, false)

      await authereumRecoveryModule.completeRecovery(
        accountContract.address, RECOVERY_ADDRESS
      )

      await expectAuthKey(NEW_AUTH_KEY_2, true)
    })
  })

  describe('addRecoveryAccount', async () => {
    context('Happy path', () => {
      it('Should allow Authereum account to add recovery address', async () => {
        await expectInactiveRecoveryAccount(RECOVERY_ADDRESS)

        const tx = await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectActiveRecoveryAccount(RECOVERY_ADDRESS)

        utils.expectRawEvent(tx, 'RecoveryAddressAdded(address,address,uint256)')
      })
    })

    context('Non-Happy path', () => {
      it('Should not allow recovery address to be added if recovery module is not registered to account', async () => {
        await accountContract.removeAuthKey(authereumRecoveryModule.address, { from: AUTH_KEY })
        await expectAuthKey(authereumRecoveryModule.address, false)

        await expectRevert(
          addRecoveryAccount(RECOVERY_ADDRESS),
          constants.REVERT_MSG.RM_RECOVERY_MODULE_NOT_REGISTERED
        )

        await expectInactiveRecoveryAccount(RECOVERY_ADDRESS)
      })

      it('Should not allow a duplicate recovery address to be added', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectActiveRecoveryAccount(RECOVERY_ADDRESS)

        await expectRevert(
          addRecoveryAccount(RECOVERY_ADDRESS),
          constants.REVERT_MSG.RM_RECOVERY_ADDRESS_ALREADY_ADDED
        )
      })

      it('Should not allow recovery address to be set to address(0)', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectActiveRecoveryAccount(RECOVERY_ADDRESS)

        await expectRevert(
          addRecoveryAccount(constants.ZERO_ADDRESS),
          constants.REVERT_MSG.RM_RECOVERY_ADDRESS_CANNOT_BE_ZERO
        )
      })

      it('Should not allow recovery address to be set to self', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectActiveRecoveryAccount(RECOVERY_ADDRESS)

        await expectRevert(
          addRecoveryAccount(accountContract.address),
          constants.REVERT_MSG.RM_RECOVERY_ADDRESS_CANNOT_BE_SELF
        )
      })
    })
  })

  describe('removeRecoveryAccount', async () => {
    context('Happy path', () => {
      beforeEach(async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)
      })

      it('Should allow Authereum account to remove recovery address', async () => {
        await expectActiveRecoveryAccount(RECOVERY_ADDRESS)

        const tx = await removeRecoveryAccount(RECOVERY_ADDRESS)

        await expectInactiveRecoveryAccount(RECOVERY_ADDRESS)

        utils.expectRawEvent(tx, 'RecoveryAddressRemoved(address,address)')
      })

      it('Should delete recovery attempt when recovery address is removed', async () => {
        await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )

        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)

        const tx = await removeRecoveryAccount(RECOVERY_ADDRESS)

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)
        utils.expectRawEvent(tx, 'RecoveryCancelled(address,address,address)')
      })
    })

    context('Non-Happy path', () => {
      it('Should not allow attacker to remove recovery address', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectActiveRecoveryAccount(RECOVERY_ADDRESS)

        await expectRevert(
          authereumRecoveryModule.removeRecoveryAccount(RECOVERY_ADDRESS, { from: ATTACKER_ADDRESS }),
          constants.REVERT_MSG.RM_RECOVERY_ADDRESS_ALREADY_INACTIVE
        )

        await expectActiveRecoveryAccount(RECOVERY_ADDRESS)
      })

      it('Should not allow a nonexistent recovery address to be removed', async () => {
        await expectInactiveRecoveryAccount(ATTACKER_ADDRESS)

        await expectRevert(
          removeRecoveryAccount(RECOVERY_ADDRESS),
          constants.REVERT_MSG.RM_RECOVERY_ADDRESS_ALREADY_INACTIVE
        )
      })
    })
  })

  describe('startRecovery', async () => {
    context('Happy path', () => {
      beforeEach(async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)
      })

      it('Should allow recovery address to start recovery', async () => {
        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)

        const tx = await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )

        let recoveryAttempt = await authereumRecoveryModule.recoveryAttempts(
          accountContract.address, RECOVERY_ADDRESS
        )
        expectEvent(tx, 'RecoveryStarted', {
          accountContract: accountContract.address,
          recoveryAddress: RECOVERY_ADDRESS,
          newAuthKey: NEW_AUTH_KEY,
          startTime: recoveryAttempt[0],
          recoveryDelay: RECOVERY_DELAY.toString()
        })

        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)
      })
    })

    context('Non-Happy path', () => {
      it('Should not allow attacker to start recovery', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)

        await expectRevert(
          authereumRecoveryModule.startRecovery(
            accountContract.address, NEW_AUTH_KEY, { from: ATTACKER_ADDRESS }
          ),
          constants.REVERT_MSG.RM_INACTIVE_RECOVERY_ACCOUNT
        )

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)
      })

      it('Should not allow an active recovery process to be started again', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )

        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)

        await expectRevert(
          authereumRecoveryModule.startRecovery(
            accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
          ),
          constants.REVERT_MSG.RM_RECOVERY_ALREADY_IN_PROCESS
        )
      })

      it('Should not allow the new Auth Key to be address(0)', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)

        await expectRevert(
          authereumRecoveryModule.startRecovery(
            accountContract.address,
            constants.ZERO_ADDRESS,
            { from: RECOVERY_ADDRESS }
          ),
          constants.REVERT_MSG.RM_AUTH_KEY_CANNOT_BE_ZERO
        )

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)
      })
    })
  })

  describe('cancelRecovery', async () => {

    context('Happy path', () => {
      beforeEach(async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)
        await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )
      })

      it('Should allow recovery address to cancel recovery', async () => {
        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)

        const tx = await authereumRecoveryModule.cancelRecovery(
          accountContract.address, { from: RECOVERY_ADDRESS }
        )
        expectEvent(tx, 'RecoveryCancelled', {
          accountContract: accountContract.address,
          recoveryAddress: RECOVERY_ADDRESS,
          newAuthKey: NEW_AUTH_KEY
        })

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)
      })
    })

    context('Non-Happy path', () => {
      it('Should not allow attacker to cancel recovery', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)
        await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )

        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)

        await expectRevert(
          authereumRecoveryModule.cancelRecovery(
            accountContract.address, { from: ATTACKER_ADDRESS }
          ),
          constants.REVERT_MSG.RM_INACTIVE_RECOVERY_ACCOUNT
        )

        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)
      })

      it('Should not allow a non-existent recovery process to be cancelled', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)

        await expectRevert(
          authereumRecoveryModule.cancelRecovery(
            accountContract.address, { from: RECOVERY_ADDRESS }
          ),
          constants.REVERT_MSG.RM_NO_RECOVERY_ATTEMPT
        )
      })
    })
  })

  describe('completeRecovery', async () => {
    context('Happy path', () => {
      beforeEach(async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)
        await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )
      })

      it('Should allow any account to complete recovery', async () => {
        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)

        await expectAuthKey(NEW_AUTH_KEY, false)

        await timeUtils.increaseTime(RECOVERY_DELAY + 1)

        // Any address can call complete recovery
        const tx = await authereumRecoveryModule.completeRecovery(
          accountContract.address, RECOVERY_ADDRESS
        )
        expectEvent(tx, 'RecoveryCompleted', {
          accountContract: accountContract.address,
          recoveryAddress: RECOVERY_ADDRESS,
          newAuthKey: NEW_AUTH_KEY
        })

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)

        await expectAuthKey(NEW_AUTH_KEY, true)
      })
    })

    context('Non-Happy path', () => {
      it('Should not allow for recovery if recovery address has been removed', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)
        await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )

        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)

        await expectAuthKey(NEW_AUTH_KEY, false)

        await timeUtils.increaseTime(RECOVERY_DELAY + 1)

        await removeRecoveryAccount(RECOVERY_ADDRESS)

        await expectRevert(
          authereumRecoveryModule.completeRecovery(
            accountContract.address, RECOVERY_ADDRESS
          ),
          constants.REVERT_MSG.RM_INACTIVE_RECOVERY_ACCOUNT
        )

        await expectAuthKey(NEW_AUTH_KEY, false)
      })

      it('Should not allow for recovery if delay period has not passed', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)
        await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )

        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)

        await expectAuthKey(NEW_AUTH_KEY, false)

        await expectRevert(
          authereumRecoveryModule.completeRecovery(
            accountContract.address, RECOVERY_ADDRESS
          ),
          constants.REVERT_MSG.RM_RECOVERY_DELAY_INCOMPLETE
        )

        await expectAuthKey(NEW_AUTH_KEY, false)
      })

      it('Should not allow for recovery if recovery has not started', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)

        await expectNoRecoveryAttempt(RECOVERY_ADDRESS)

        await expectAuthKey(NEW_AUTH_KEY, false)

        await expectRevert(
          authereumRecoveryModule.completeRecovery(
            accountContract.address, RECOVERY_ADDRESS
          ),
          constants.REVERT_MSG.RM_NO_RECOVERY_ATTEMPT
        )

        await expectAuthKey(NEW_AUTH_KEY, false)
      })

      it('Should not allow for recovery if the recovery address was added as an AuthKey on the base contract', async () => {
        await addRecoveryAccount(RECOVERY_ADDRESS)
        await authereumRecoveryModule.startRecovery(
          accountContract.address, NEW_AUTH_KEY, { from: RECOVERY_ADDRESS }
        )

        await expectRecoveryAttempt(RECOVERY_ADDRESS, NEW_AUTH_KEY)

        await expectAuthKey(NEW_AUTH_KEY, false)

        await timeUtils.increaseTime(RECOVERY_DELAY + 1)

        await accountContract.addAuthKey(NEW_AUTH_KEY, { from: AUTH_KEY })

        await expectRevert(
          authereumRecoveryModule.completeRecovery(
            accountContract.address, RECOVERY_ADDRESS
          ),
          constants.REVERT_MSG.BA_AUTH_KEY_ALREADY_ADDED
        )
      })
    })
  })

  async function addRecoveryAccount(recoveryAddress) {
    const addRecoveryKeyCalldata = web3.eth.abi.encodeFunctionCall({
      name: 'addRecoveryAccount',
      type: 'function',
      inputs: [{
        type: 'address',
        name: '_recoveryAddress'
      }, {
        type: 'uint256',
        name: '_recoveryDelay'
      }]
    }, [recoveryAddress, RECOVERY_DELAY])

    const addRecoveryTransactionData = encodeTransactionData(
      addRecoveryKeyCalldata,
      authereumRecoveryModule.address
    )

    // Add recovery account
    return accountContract.executeMultipleMetaTransactions([addRecoveryTransactionData], { from: AUTH_KEY })
  }

  async function removeRecoveryAccount(recoveryAddress ) {
    const removeRecoveryKeyCalldata = web3.eth.abi.encodeFunctionCall({
      name: 'removeRecoveryAccount',
      type: 'function',
      inputs: [{
        type: 'address',
        name: '_recoveryAddress'
      }]
    }, [recoveryAddress])

    const addRecoveryTransactionData = encodeTransactionData(
      removeRecoveryKeyCalldata,
      authereumRecoveryModule.address
    )
  
    // Add recovery account
    return accountContract.executeMultipleMetaTransactions([addRecoveryTransactionData], { from: AUTH_KEY })
  }

  async function expectActiveRecoveryAccount(recoveryAddress) {
    await expectRecoveryAccount(RECOVERY_ADDRESS, true, RECOVERY_DELAY)
  }

  async function expectInactiveRecoveryAccount(recoveryAddress) {
    await expectRecoveryAccount(RECOVERY_ADDRESS, false, 0)
  }

  async function expectRecoveryAccount(recoveryAddress, active, recoveryDelay) {
    let recoveryAccount = await authereumRecoveryModule.recoveryAccounts(
      accountContract.address, RECOVERY_ADDRESS
    )
    expect(recoveryAccount[0]).to.eq(active)
    expect(recoveryAccount[1].toNumber()).to.eq(recoveryDelay)
  }

  async function expectRecoveryAttempt(recoveryAddress, newAuthKey) {
    let recoveryAttempt = await authereumRecoveryModule.recoveryAttempts(
      accountContract.address, recoveryAddress
    )
    expect(recoveryAttempt[0].toNumber()).to.be.gt(0)
    expect(recoveryAttempt[1]).to.eq(newAuthKey)
  }

  async function expectNoRecoveryAttempt(recoveryAddress) {
    let recoveryAttempt = await authereumRecoveryModule.recoveryAttempts(
      accountContract.address, recoveryAddress
    )
    expect(recoveryAttempt[0].toNumber()).to.eq(0)
    expect(recoveryAttempt[1]).to.eq(constants.ZERO_ADDRESS)
  }

  async function expectAuthKey(authKey, isAuthKey) {
    let isValidAuthKey = await accountContract.authKeys(authKey)
    expect(isValidAuthKey).to.eq(isAuthKey)
  }

  function encodeTransactionData(calldata, to) {
    return web3.eth.abi.encodeParameters(
      ['address', 'uint256', 'uint256', 'bytes'],
      [to, 0, GAS_LIMIT, calldata]
    )
  }
})
