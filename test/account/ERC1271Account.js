const isValidSignature = require('is-valid-signature')
const { expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')

contract('ERC1271Account', function (accounts) {
  const AUTH_KEYS = [accounts[1]]
  const AUTHEREUM_OWNER = accounts[9]
  const LOGIN_KEY = accounts[10]
  const VALID_SIG = '0x20c13b0b'
  const INVALID_SIG = '0xffffffff'

  // Test Params
  let snapshotId

  // Proxy Creation Params
  let expectedSalt

  // Addresses
  let expectedAddress

  // Logic Addresses
  let authereumProxyFactoryLogicContract
  let authereumAccountLogicContract

  // Contract Instances
  let authereumProxyAccount

  before(async () => {

    // Set up ENS defaults
    const { authereumEnsManager } = await utils.setENSDefaults(AUTHEREUM_OWNER)

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumAccountLogicContract.address, authereumEnsManager.address)

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)

    // Create default proxies
    expectedSalt = constants.SALT
    label = constants.DEFAULT_LABEL

    expectedAddress = await utils.createDefaultProxy(
      expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
      AUTH_KEYS[0], label, authereumAccountLogicContract.address
    )

    // Wrap in truffle-contract
    authereumProxyAccount = await ArtifactAuthereumAccount.at(expectedAddress)
  })

  // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot();
  });

  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result);
  });

  //**********//
  //  Tests  //
  //********//

  describe('isValidSignature', () => {
    context('Happy Path', async () => {
      it('Should return the magic value for a login key signature', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHashSignature } = utils.getArbitraryBytesSignedMessage(msg)
        const loginKeyRestrictionsData = web3.eth.abi.encodeParameter('uint256', 1673256750) // Arbitrary expiration time
        const signingKeyAuthorizationSignature = utils.getSignedLoginKey(LOGIN_KEY, loginKeyRestrictionsData)

        // Concat loginKeyRestrictionsData, signingKeyAuthorizationSignature, and loginKeyRestrictionsData
        let combinedSignature = utils.concatHex(
          msgHashSignature,
          signingKeyAuthorizationSignature
        )
        combinedSignature = utils.concatHex(
          combinedSignature,
          loginKeyRestrictionsData
        )

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, msg, combinedSignature, web3), true)

        // Direct contract interaction (calls isValidSignature() and isValidLoginKeySignature())
        assert.equal(await authereumProxyAccount.isValidSignature(msgBytes, combinedSignature), VALID_SIG)
        assert.equal(await authereumProxyAccount.isValidLoginKeySignature(msgBytes, combinedSignature), VALID_SIG)
      })
      it('Should return the magic value for an auth key signature', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHashSignature } = utils.getAuthSignedMessage(msg)

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, msg, msgHashSignature, web3), true)

        // Direct contract interaction (calls isValidSignature() and isValidAuthKeySignature())
        assert.equal(await authereumProxyAccount.isValidSignature(msgBytes, msgHashSignature), VALID_SIG)
        assert.equal(await authereumProxyAccount.isValidAuthKeySignature(msgBytes, msgHashSignature), VALID_SIG)
      })
      it('Should return INVALID_SIG for isValidLoginKeySignature() due to a signature of length > 130 but bad data', async () => {
        const msg = 'Hello, World!'
        const badMsg = 'Goodbye, World!'
        const badMsgBytes = utils.stringToBytes(badMsg)
        const { msgHashSignature } = utils.getArbitraryBytesSignedMessage(msg)
        const loginKeyRestrictionsData = web3.eth.abi.encodeParameter('uint256', 1673256750) // Arbitrary expiration time
        const signingKeyAuthorizationSignature = utils.getSignedLoginKey(LOGIN_KEY, loginKeyRestrictionsData)
        const combinedSignature = utils.concatHex(
          msgHashSignature,
          signingKeyAuthorizationSignature,
          loginKeyRestrictionsData
        )
        const badCombinedSignature = combinedSignature + 'ab'

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, badMsg, badCombinedSignature, web3), false)

        // Direct contract interaction (calls isValidSignature() and isValidLoginKeySignature())
        assert.equal(await authereumProxyAccount.isValidSignature(badMsgBytes, badCombinedSignature), INVALID_SIG)
        assert.equal(await authereumProxyAccount.isValidLoginKeySignature(badMsgBytes, badCombinedSignature), INVALID_SIG)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not return the magic value for a login key signature due to bad message', async () => {
        const msg = 'Hello, World!'
        const badMsg = 'Goodbye, World!'
        const badMsgBytes = utils.stringToBytes(badMsg)
        const { msgHashSignature } = utils.getArbitraryBytesSignedMessage(msg)
        const loginKeyRestrictionsData = web3.eth.abi.encodeParameter('uint256', 1673256750) // Arbitrary expiration time
        const signingKeyAuthorizationSignature = utils.getSignedLoginKey(LOGIN_KEY, loginKeyRestrictionsData)
        const combinedSignature = utils.concatHex(
          msgHashSignature,
          signingKeyAuthorizationSignature,
          loginKeyRestrictionsData
        )

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, badMsg, combinedSignature, web3), false)

        // Direct contract interaction (calls isValidSignature() and isValidLoginKeySignature())
        assert.equal(await authereumProxyAccount.isValidSignature(badMsgBytes, combinedSignature), INVALID_SIG)
        assert.equal(await authereumProxyAccount.isValidLoginKeySignature(badMsgBytes, combinedSignature), INVALID_SIG)
      })
      it('Should not return the magic value for an auth key signature due to bad message', async () => {
        const msg = 'Hello, World!'
        const badMsg = 'Goodbye, World!'
        const badMsgBytes = utils.stringToBytes(badMsg)
        const { msgHashSignature } = utils.getAuthSignedMessage(msg)

        // is-valid-signature package interaction (calls isValidSignature())
        assert.equal(await isValidSignature(authereumProxyAccount.address, badMsg, msgHashSignature, web3), false)

        // Direct contract interaction (calls isValidSignature() and isValidAuthKeySignature())
        assert.equal(await authereumProxyAccount.isValidSignature(badMsgBytes, msgHashSignature), INVALID_SIG)
        assert.equal(await authereumProxyAccount.isValidAuthKeySignature(badMsgBytes, msgHashSignature), INVALID_SIG)
      })
      it('Should revert isValidSignature() due to a signature of length < 65', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHashSignature } = utils.getAuthSignedMessage(msg)
        // Remove 2 in order to remove a whole byte. If a single character is removed, then the bytes length is still registered the same as if none were removed
        const badMsgHashSignature = msgHashSignature.substring(0, msgHashSignature.length - 2)

        // is-valid-signature package interaction (calls isValidSignature())
        await expectRevert(isValidSignature(authereumProxyAccount.address, msg, badMsgHashSignature, web3), constants.REVERT_MSG.ERC1271_INVALID_SIG)

        // Direct contract interaction (calls isValidSignature())
        await expectRevert(authereumProxyAccount.isValidSignature(msgBytes, badMsgHashSignature), constants.REVERT_MSG.ERC1271_INVALID_SIG)
      })
      it('Should revert isValidSignature() due to a signature of length > 65 and < 130', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHashSignature } = utils.getAuthSignedMessage(msg)
        const badMsgHashSignature = msgHashSignature + 'ab'

        // is-valid-signature package interaction (calls isValidSignature)
        await expectRevert(isValidSignature(authereumProxyAccount.address, msg, badMsgHashSignature, web3), constants.REVERT_MSG.ERC1271_INVALID_SIG)

        // Direct contract interaction (calls isValidSignature())
        await expectRevert(authereumProxyAccount.isValidSignature(msgBytes, badMsgHashSignature), constants.REVERT_MSG.ERC1271_INVALID_SIG)
      })
      it('Should revert isValidAuthKeySignature() due to a signature of length != 65', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHashSignature } = utils.getAuthSignedMessage(msg)
        // Remove 2 in order to remove a whole byte. If a single character is removed, then the bytes length is still registered the same as if none were removed
        const badMsgHashSignature = msgHashSignature.substring(0, msgHashSignature.length - 2)

        // NOTE: the is-valid-signature package does not interact directly with isValidAuthKeySignature()

        // Direct contract interaction (calls isValidAuthKeySignature())
        await expectRevert(authereumProxyAccount.isValidAuthKeySignature(msgBytes, badMsgHashSignature), constants.REVERT_MSG.ERC1271_INVALID_AUTH_KEY_SIG)
      })
      it('Should revert isValidLoginKeySignature() due to a signature of length < 130', async () => {
        const msg = 'Hello, World!'
        const msgBytes = utils.stringToBytes(msg)
        const { msgHashSignature } = utils.getAuthSignedMessage(msg)
        // Remove 2 in order to remove a whole byte. If a single character is removed, then the bytes length is still registered the same as if none were removed
        const badMsgHashSignature = msgHashSignature.substring(0, msgHashSignature.length - 2)

        // NOTE: the is-valid-signature package does not interact directly with isValidLoginKeySignature()

        // Direct contract interaction (calls isValidLoginKeySignature())
        await expectRevert(authereumProxyAccount.isValidLoginKeySignature(msgBytes, badMsgHashSignature), constants.REVERT_MSG.ERC1271_INVALID_LOGIN_KEY_SIG)
      })
    })
  })
})
