const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers')
const constants = require('../utils/constants.js')
const utils = require('../utils/utils')
const timeUtils = require('../utils/time.js')

const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumDelegateKeyModule = artifacts.require('AuthereumDelegateKeyModule')
const ArtifactReturnTransaction = artifacts.require('ReturnTransaction')
const ArtifactAuthereumRecoveryModule = artifacts.require('AuthereumRecoveryModule')
const ArtifactERC1820Registry = artifacts.require('ERC1820Registry')

const GAS_LIMIT = 1000000
const RECOVERY_DELAY = 100

contract('AuthereumDelegateKeyModule', function (accounts) {
  let beforeAllSnapshotId
  let snapshotId

  const AUTHEREUM_OWNER = accounts[0]
  const AUTH_KEY = accounts[1]
  const NEW_AUTH_KEY = accounts[2]
  const DELEGATE_KEY_ADDRESS = accounts[3]
  const ATTACKER_ADDRESS = accounts[4]

  const ALTERNATIVE_APPROVED_ADDRESS = accounts[5]
  const ALTERNATIVE_FUNCTION_SELECTOR = '0xa1b2c3d4'

  const NUM1 = 1
  const NUM2 = 2

  const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000'
  const ZERO_BYTES4 = '0x00000000'
  const NUM1_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000001'
  const NUM2_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000002'
  const SOME_ETH = '1000'
  const ZERO_FUNCTION_SELECTOR = '0x00000000'
  const ZERO_DATA = '0x'

  let accountContract
  let delegateKeyModule
  let returnTransaction
  let returnTransactionSelector
  let returnTransactionData
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

    // Add the delegate key
    delegateKeyModule = await ArtifactAuthereumDelegateKeyModule.new()
    await accountContract.addAuthKey(delegateKeyModule.address, { from: AUTH_KEY })
    await expectAuthKey(delegateKeyModule.address, true)

    // Handle post-proxy deployment
    await utils.setAuthereumRecoveryModule(accountContract, authereumRecoveryModule.address, AUTH_KEY)
    await utils.setAccountIn1820Registry(accountContract, erc1820Registry.address, AUTH_KEY)

    returnTransaction = await ArtifactReturnTransaction.new()

    const returnTestFunction = {
      name: 'returnTest2',
      type: 'function',
      inputs: [
        {
          type: 'uint256',
          name: 'num1'
        },
        {
          type: 'uint256',
          name: 'num2'
        }
      ]
    }

    returnTransactionSelector = web3.eth.abi.encodeFunctionSignature(returnTestFunction)
    returnTransactionData = web3.eth.abi.encodeFunctionCall(returnTestFunction, [NUM1, NUM2])
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
        const _name = await delegateKeyModule.name.call()
        assert.equal(_name, constants.CONTRACT_NAMES.DELEGATE_KEY_MODULE)
      })
    })
  })
  context('Happy path', () => {
    it('Should allow delegate key to make transaction', async () => {
      await addDelegateKey(
        DELEGATE_KEY_ADDRESS,
        returnTransactionSelector,
        returnTransaction.address,
        0,
        [false, false],
        [ZERO_BYTES32, ZERO_BYTES32]
      )

      await expectDelegateKey(
        returnTransactionSelector,
        returnTransaction.address,
        '0'
      )

      const tx = await delegateKeyModule.executeTransaction(
        accountContract.address,
        0,
        returnTransactionData,
        { from: DELEGATE_KEY_ADDRESS }
      )

      utils.expectRawEvent(tx, 'UintEvent2(uint256,uint256)')
    })

    it('Should allow delegate key to make transaction with a 0x function selector', async () => {
      await web3.eth.sendTransaction({
        from: accounts[0],
        to: accountContract.address,
        value: SOME_ETH
      })

      let accountBalance = await web3.eth.getBalance(accountContract.address)
      expect(accountBalance.toString()).to.eq(SOME_ETH)

      await addDelegateKey(
        DELEGATE_KEY_ADDRESS,
        ZERO_FUNCTION_SELECTOR,
        AUTH_KEY,
        SOME_ETH,
        [],
        []
      )

      await expectDelegateKey(
        ZERO_FUNCTION_SELECTOR,
        AUTH_KEY,
        SOME_ETH
      )

      await delegateKeyModule.executeTransaction(
        accountContract.address,
        SOME_ETH,
        ZERO_DATA,
        { from: DELEGATE_KEY_ADDRESS }
      )

      accountBalance = await web3.eth.getBalance(accountContract.address)
      expect(accountBalance.toString()).to.eq('0')
    })
  })

  describe('addDelegateKey', async () => {
    context('Happy path', () => {
      it('Should allow an Authereum account to add a new Delegate Key to be added', async () => {
        const tx = await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )
        utils.expectRawEvent(tx, 'DelegateKeyAdded(address,address,bytes4,address,uint256)')

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )
      })
    })

    context('Non-Happy path', () => {
      it('Should not allow the Delegate Key to be address(0)', async () => {
        await expectRevert(
          addDelegateKey(
            constants.ZERO_ADDRESS,
            returnTransactionSelector,
            returnTransaction.address,
            0,
            [false, false],
            [ZERO_BYTES32, ZERO_BYTES32]
          ),
          constants.REVERT_MSG.DKM_DELEGATE_KEY_CANNOT_BE_ZERO
        )
      })

      it('Should not allow an Authereum account to add a delegate key that is already registered', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )
        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )

        await expectRevert(
          addDelegateKey(
            DELEGATE_KEY_ADDRESS,
            ALTERNATIVE_FUNCTION_SELECTOR,
            ALTERNATIVE_APPROVED_ADDRESS,
            5,
            [false, false],
            [ZERO_BYTES32, ZERO_BYTES32]
          ),
          constants.REVERT_MSG.DKM_ALREADY_REGISTERED
        )
      })

      it('Should not allow _lockedParameters to be a different length than lockedParameterValues', async () => {
        await expectRevert(
          addDelegateKey(
            DELEGATE_KEY_ADDRESS,
            returnTransactionSelector,
            returnTransaction.address,
            0,
            [false, false],
            [ZERO_BYTES32]
          ),
          constants.REVERT_MSG.DKM_LOCKED_PARAMETERS_LENGTHS_NOT_EQUAL
        )
      })

      it('Should not allow addDelegateKey to be called if the DelegateKeyModule is not an auth key', async () => {
        await accountContract.removeAuthKey(delegateKeyModule.address, { from: AUTH_KEY })

        await expectAuthKey(delegateKeyModule.address, false)

        await expectRevert(
          addDelegateKey(
            DELEGATE_KEY_ADDRESS,
            returnTransactionSelector,
            returnTransaction.address,
            0,
            [false, false],
            [ZERO_BYTES32, ZERO_BYTES32]
          ),
          constants.REVERT_MSG.DKM_MODULE_NOT_REGISTERED
        )
      })
    })
  })

  describe('removeDelegateKey', async () => {
    context('Happy path', () => {
      it('Should allow an Authereum account to remove it\'s Delegate Key', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )

        const tx = await removeDelegateKey(DELEGATE_KEY_ADDRESS)
        utils.expectRawEvent(tx, 'DelegateKeyRemoved(address,address)')

        await expectNoDelegateKey()
      })
    })

    context('Non-Happy path', () => {
      it('Should not allow non-existent Delegate Key to be removed', async () => {
        await expectRevert(
          removeDelegateKey(DELEGATE_KEY_ADDRESS),
          constants.REVERT_MSG.DKM_DELEGATE_KEY_NOT_ACTIVE
        )
      })

      it('Should not allow an random account to remove another Authereum account\'s Delegate Key', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )

        await expectRevert(
          removeDelegateKey(DELEGATE_KEY_ADDRESS, ATTACKER_ADDRESS),
          constants.REVERT_MSG.BA_REQUIRE_AUTH_KEY_OR_SELF
        )
      })
    })
  })

  describe('executeTransaction', async () => {
    context('Happy path', () => {
      it('Should allow approved transaction to be executed', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, true],
          [ZERO_BYTES32, NUM2_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )
        // Check return value
        const res = await delegateKeyModule.executeTransaction.call(
          accountContract.address,
          0,
          returnTransactionData,
          { from: DELEGATE_KEY_ADDRESS }
        )
        expect(res[0]).to.eq(NUM1_BYTES32)

        // Make transaction
        const tx = await delegateKeyModule.executeTransaction(
          accountContract.address,
          0,
          returnTransactionData,
          { from: DELEGATE_KEY_ADDRESS }
        )

        utils.expectRawEvent(tx, 'UintEvent2(uint256,uint256)')
        expectEvent(tx, 'TransactionExecuted', {
          authereumAccount: accountContract.address,
          delegateKey: DELEGATE_KEY_ADDRESS,
          value: '0',
          data: returnTransactionData
        })
        utils.expectRawEvent(tx, 'TransactionExecuted(address,address,uint256,bytes)')
      })
    })

    context('Non-Happy path', () => {
      it('Should not allow execution if Delegate Key is not registered', async () => {
        await expectNoDelegateKey()

        await expectRevert(
          delegateKeyModule.executeTransaction(
            accountContract.address,
            0,
            returnTransactionData,
            { from: DELEGATE_KEY_ADDRESS }
          ),
          constants.REVERT_MSG.DKM_DELEGATE_KEY_NOT_ACTIVE
        )
      })

      it('Should not allow execution if executeTransaction is being reentered', async () => {
        const reentrantFunction = {
          name: 'executeTransaction',
          type: 'function',
          inputs: [
            {
              type: 'address',
              name: '_authereumAccount'
            },
            {
              type: 'uint256',
              name: '_value'
            },
            {
              type: 'bytes',
              name: '_data'
            }
          ]
        }

        const _authereumAccount = accountContract.address
        const _value = 0
        const _data = web3.eth.abi.encodeFunctionCall(reentrantFunction, [_authereumAccount, _value, '0x'])

        reentrantFunctionSelector = web3.eth.abi.encodeFunctionSignature(reentrantFunction)
        reentrantFunctionData = web3.eth.abi.encodeFunctionCall(reentrantFunction, [_authereumAccount, _value, _data])

        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          reentrantFunctionSelector,
          delegateKeyModule.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          reentrantFunctionSelector,
          delegateKeyModule.address,
          '0'
        )

        await expectRevert(
          delegateKeyModule.executeTransaction(
            accountContract.address,
            0,
            reentrantFunctionData,
            { from: DELEGATE_KEY_ADDRESS }
          ),
          constants.REVERT_MSG.RG_REENTRANT_CALL
        )
      })

      it('Should not allow execution if Delegate Key has been removed', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )

        await removeDelegateKey(DELEGATE_KEY_ADDRESS)

        await expectNoDelegateKey()

        await expectRevert(
          delegateKeyModule.executeTransaction(
            accountContract.address,
            0,
            returnTransactionData,
            { from: DELEGATE_KEY_ADDRESS }
          ),
          constants.REVERT_MSG.DKM_DELEGATE_KEY_NOT_ACTIVE
        )
      })

      it('Should not allow execution if value is greater than max value', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          1,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '1'
        )

        await expectRevert(
          delegateKeyModule.executeTransaction(
            accountContract.address,
            2,
            returnTransactionData,
            { from: DELEGATE_KEY_ADDRESS }
          ),
          constants.REVERT_MSG.DKM_VALUE_HIGHER_THAN_MAXIMUM
        )
      })

      it('Should not allow execution if function signature is invalid', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )

        const invalidTestFunction = {
          name: 'invalidTest',
          type: 'function',
          inputs: [
            {
              type: 'uint256',
              name: 'num1'
            },
            {
              type: 'uint256',
              name: 'num2'
            }
          ]
        }
        const invalidTransactionData = web3.eth.abi.encodeFunctionCall(invalidTestFunction, [NUM1, NUM2])

        await expectRevert(
          delegateKeyModule.executeTransaction(
            accountContract.address,
            0,
            invalidTransactionData,
            { from: DELEGATE_KEY_ADDRESS }
          ),
          constants.REVERT_MSG.DKM_INVALID_FUNCTION_SELECTOR
        )
      })

      it('Should not allow execution if a locked parameter does not match the locked value', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, true],
          [ZERO_BYTES32, NUM2_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )

        const returnTestFunction = {
          name: 'returnTest2',
          type: 'function',
          inputs: [
            {
              type: 'uint256',
              name: 'num1'
            },
            {
              type: 'uint256',
              name: 'num2'
            }
          ]
        }
        const invalidTransactionData = web3.eth.abi.encodeFunctionCall(returnTestFunction, [NUM1, 9])

        await expectRevert(
          delegateKeyModule.executeTransaction(
            accountContract.address,
            0,
            invalidTransactionData,
            { from: DELEGATE_KEY_ADDRESS }
          ),
          constants.REVERT_MSG.DKM_INVALID_PARAMETER
        )
      })

      it('Should not allow execution if data is too short', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )

        const invalidTestFunction = {
          name: 'returnTest2',
          type: 'function',
          inputs: [
            {
              type: 'uint256',
              name: 'num1'
            }
          ]
        }
        const invalidTransactionData = web3.eth.abi.encodeFunctionCall(invalidTestFunction, [NUM1])

        await expectRevert(
          delegateKeyModule.executeTransaction(
            accountContract.address,
            0,
            invalidTransactionData,
            { from: DELEGATE_KEY_ADDRESS }
          ),
          constants.REVERT_MSG.DKM_TRANSACTION_DATA_TOO_SHORT
        )
      })

      it('Should now allow execution if data is too long (and ignore the additional data (1 byte)', async () => {
        // NOTE: This will fail because of an incorrect function signature
        // This is because ethers.js will pad an odd-length piece of data
        // with a 0 in the front, thus changing the function signature
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )
  
        const invalidTransactionData = returnTransactionData + 'a'

        await expectRevert(
          delegateKeyModule.executeTransaction(
            accountContract.address,
            0,
            invalidTransactionData,
            { from: DELEGATE_KEY_ADDRESS }
          ),
          constants.REVERT_MSG.DKM_INVALID_FUNCTION_SELECTOR
        )
      })

      it('Should allow execution if data is too long (and ignore the additional data (2 bytes)', async () => {
        await addDelegateKey(
          DELEGATE_KEY_ADDRESS,
          returnTransactionSelector,
          returnTransaction.address,
          0,
          [false, false],
          [ZERO_BYTES32, ZERO_BYTES32]
        )

        await expectDelegateKey(
          returnTransactionSelector,
          returnTransaction.address,
          '0'
        )
  
        const invalidTransactionData = returnTransactionData + 'ab'

        const tx = await delegateKeyModule.executeTransaction(
          accountContract.address,
          0,
          invalidTransactionData,
          { from: DELEGATE_KEY_ADDRESS }
        )

        utils.expectRawEvent(tx, 'UintEvent2(uint256,uint256)')
      })
    })
  })

  async function expectAuthKey (authKey, isAuthKey) {
    let isValidAuthKey = await accountContract.authKeys(authKey)
    expect(isValidAuthKey).to.eq(isAuthKey)
  }

  async function expectDelegateKey (approvedFunctionSelector, approvedDestination, maxValue) {
    const delegateKeyInfo = await delegateKeyModule.delegateKeys(
      accountContract.address,
      DELEGATE_KEY_ADDRESS
    )

    expect(delegateKeyInfo.approvedDestination).to.eq(approvedDestination)
    expect(delegateKeyInfo.approvedFunctionSelector).to.eq(approvedFunctionSelector)
    expect(delegateKeyInfo.maxValue.toString()).to.eq(maxValue)
  }

  async function expectNoDelegateKey () {
    const delegateKeyInfo = await delegateKeyModule.delegateKeys(
      accountContract.address,
      DELEGATE_KEY_ADDRESS
    )

    expect(delegateKeyInfo.approvedDestination).to.eq(constants.ZERO_ADDRESS)
    expect(delegateKeyInfo.approvedFunctionSelector).to.eq(ZERO_BYTES4)
    expect(delegateKeyInfo.maxValue.toString()).to.eq('0')
  }

  async function addDelegateKey (
    delegateKeyAddress,
    approvedFunctionSelector,
    approvedDestination,
    maxValue,
    lockedParameters,
    lockedParameterValues
  ) {
    const addDelegateKeyData = encodeUpdateDelegateKeyData(
      delegateKeyAddress,
      approvedFunctionSelector,
      approvedDestination,
      maxValue,
      lockedParameters,
      lockedParameterValues
    )

    const addDelegateKeyTransaction = encodeTransactionData(
      addDelegateKeyData,
      delegateKeyModule.address
    )

    return accountContract.executeMultipleMetaTransactions(
      [addDelegateKeyTransaction],
      { from: AUTH_KEY }
    )
  }

  async function removeDelegateKey (
    delegateKeyAddress,
    fromAddress
  ) {
    fromAddress = fromAddress || AUTH_KEY
    const removeDelegateKeyData = encodeRemoveDelegateKeyData(delegateKeyAddress)

    const removeDelegateKeyTransaction = encodeTransactionData(
      removeDelegateKeyData,
      delegateKeyModule.address
    )

    return accountContract.executeMultipleMetaTransactions(
      [removeDelegateKeyTransaction],
      { from: fromAddress }
    )
  }

  function encodeTransactionData (calldata, to) {
    return web3.eth.abi.encodeParameters(
      ['address', 'uint256', 'uint256', 'bytes'],
      [to, 0, GAS_LIMIT, calldata]
    )
  }

  function encodeUpdateDelegateKeyData (
    delegateKeyAddress,
    approvedFunctionSelector,
    approvedDestination,
    maxValue,
    lockedParameters,
    lockedParameterValues
  ) {
    return web3.eth.abi.encodeFunctionCall({
      name: 'addDelegateKey',
      type: 'function',
      inputs: [
        {
          type: 'address',
          name: '_delegateKeyAddress'
        },
        {
          type: 'bytes4',
          name: '_approvedFunctionSelector'
        },
        {
          type: 'address',
          name: '_approvedDestination'
        },
        {
          type: 'uint256',
          name: '_maxValue'
        },
        {
          type: 'bool[]',
          name: '_lockedParameters'
        },
        {
          type: 'bytes32[]',
          name: '_lockedParameterValues'
        }
      ]
    }, [
      delegateKeyAddress,
      approvedFunctionSelector,
      approvedDestination,
      maxValue,
      lockedParameters,
      lockedParameterValues
    ])
  }

  function encodeRemoveDelegateKeyData (delegateKeyAddress) {
    return web3.eth.abi.encodeFunctionCall({
      name: 'removeDelegateKey',
      type: 'function',
      inputs: [
        {
          type: 'address',
          name: '_delegateKeyAddress'
        }
      ]
    }, [
      delegateKeyAddress
    ])
  }
})
