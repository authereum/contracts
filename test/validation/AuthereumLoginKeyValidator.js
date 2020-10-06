const { expectRevert, expectEvent } = require('@openzeppelin/test-helpers')
const timeUtils = require('../utils/time.js')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')

const ArtifactAuthereumLoginKeyValidator = artifacts.require('AuthereumLoginKeyValidator')

contract('AuthereumLoginKeyValidator', function (accounts) {
  let snapshotId
  const relayers = [accounts[0], accounts[1]]
  const maliciousAccount = accounts[1]

  let AuthereumLoginKeyValidator
  before(async () => {
    AuthereumLoginKeyValidator = await ArtifactAuthereumLoginKeyValidator.new()
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
        const _name = await AuthereumLoginKeyValidator.name.call()
        assert.equal(_name, constants.CONTRACTS.AUTHEREUM_LOGIN_KEY_VALIDATOR.NAME)
      })
    })
  })
  describe('version', () => {
    context('Happy path', () => {
      it('Should return the version of the contract', async () => {
        const _version = await AuthereumLoginKeyValidator.version.call()
        const _contractVersions = constants.CONTRACTS.AUTHEREUM_LOGIN_KEY_VALIDATOR.VERSIONS
        const _latestVersionIndex = _contractVersions.length - 1
        assert.equal(_version, _contractVersions[_latestVersionIndex])
      })
    })
  })
  describe('validateTransactions', () => {
    context('Happy path', () => {
      it('should return true for a valid transaction', async () => {
        await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        let error
        try {
          await AuthereumLoginKeyValidator.validateTransactions([], constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA, relayers[0])
        } catch (err) {
          error = err
        }
        expect(error).to.eq(undefined)
      })
    })
    context('Non-Happy path', () => {
      it('should revert if login key is expired', async () => {
        await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        const loginKeyExpirationTimeData = web3.eth.abi.encodeParameter('uint256', 1)

        await expectRevert(
          AuthereumLoginKeyValidator.validateTransactions([], loginKeyExpirationTimeData, relayers[0]),
          constants.REVERT_MSG.LKV_LOGIN_KEY_EXPIRED
        )
      })

      it('should revert if relayer is not allowed', async () => {
        await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        await expectRevert(
          AuthereumLoginKeyValidator.validateTransactions([], constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA, accounts[1]),
          constants.REVERT_MSG.LKV_INVALID_RELAYER
        )
      })

      it('should revert with additional data appended to the restrictions data (1 byte)', async () => {
        // This reverts because our off-chain provider prepends `0` to the 
        // _beginning_ of data if there is an odd-length data string
        await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        const _data = constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA + 'a'

        await expectRevert(
          AuthereumLoginKeyValidator.validateTransactions([], _data, relayers[0]),
          constants.REVERT_MSG.LKV_LOGIN_KEY_EXPIRED
        )
      })

      it('should behave as expected with additional data appended to the restrictions data (2 byte)', async () => {
        // This works because the additional data is ignored by the contract
        await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        const _data = constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA + 'ab'

        let error
        try {
          await AuthereumLoginKeyValidator.validateTransactions([], _data, relayers[0])
        } catch (err) {
          error = err
        }
        expect(error).to.eq(undefined)
      })

      it('should revert with additional data deleted from the restrictions data (1 byte)', async () => {
        // This reverts because our off-chain provider prepends `0` to the 
        // _beginning_ of data if there is an odd-length data string
        await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        const _data = constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA.substring(0, constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA.length - 1)

        await expectRevert(
          AuthereumLoginKeyValidator.validateTransactions([], _data, relayers[0]),
          constants.REVERT_MSG.LKV_LOGIN_KEY_EXPIRED
        )
      })

      it('should behave as expected with additional data appended to to the restrictions data (2 byte)', async () => {
        // This does not work because the decode function in the contract
        // does not see this as a valid `uint256`
        await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        const _data = constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA.substring(0, constants.DEFAULT_LOGIN_KEY_EXPIRATION_TIME_DATA.length - 2)

        await expectRevert(
          AuthereumLoginKeyValidator.validateTransactions([], _data, relayers[0]),
          constants.REVERT_MSG.GENERAL_REVERT
        )
      })
    })
  })
  describe('addRelayers', () => {
    context('Happy path', () => {
      it('should add a relayer', async () => {
        const tx = await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        expectEvent(tx, 'RelayerAdded', { relayer: relayers[0] })
      })
      it('should add two relayers in a single transaction', async () => {
        const tx = await AuthereumLoginKeyValidator.addRelayers(relayers)

        expectEvent(tx, 'RelayerAdded', { relayer: relayers[0] })
        expectEvent(tx, 'RelayerAdded', { relayer: relayers[1] })
      })
    })
    context('Non-Happy path', () => {
      it('should revert if relayer is allowed', async () => {

        await AuthereumLoginKeyValidator.addRelayers([relayers[0]])

        await expectRevert(
          AuthereumLoginKeyValidator.addRelayers([relayers[0]]),
          constants.REVERT_MSG.LKV_RELAYER_ALREADY_ADDED
        )
      })
      it('should revert if the transaction is not from the owner', async () => {
        await expectRevert(
          AuthereumLoginKeyValidator.addRelayers([relayers[0]], { from: maliciousAccount }),
          constants.REVERT_MSG.O_MUST_BE_OWNER
        )
      })
    })
  })
  describe('removeRelayers', () => {
    context('Happy path', () => {
      it('should remove a relayer', async () => {
        let tx = await AuthereumLoginKeyValidator.addRelayers([relayers[0]])
        expectEvent(tx, 'RelayerAdded', { relayer: relayers[0] })

        tx = await AuthereumLoginKeyValidator.removeRelayers([relayers[0]])
        expectEvent(tx, 'RelayerRemoved', { relayer: relayers[0] })
      })
      it('should remove two relayers in a single transaction', async () => {
        let tx = await AuthereumLoginKeyValidator.addRelayers(relayers)
        expectEvent(tx, 'RelayerAdded', { relayer: relayers[0] })
        expectEvent(tx, 'RelayerAdded', { relayer: relayers[1] })

        tx = await AuthereumLoginKeyValidator.removeRelayers(relayers)
        expectEvent(tx, 'RelayerRemoved', { relayer: relayers[0] })
        expectEvent(tx, 'RelayerRemoved', { relayer: relayers[1] })
      })
    })
    context('Non-Happy path', () => {
      it('should revert if relayer is already removed', async () => {
        await expectRevert(
          AuthereumLoginKeyValidator.removeRelayers([relayers[0]]),
          constants.REVERT_MSG.LKV_NOT_A_RELAYER
        )
      })
    })
    it('should revert if the transaction is not from the owner', async () => {
      // Add a relayer
      let tx = await AuthereumLoginKeyValidator.addRelayers([relayers[0]])
      expectEvent(tx, 'RelayerAdded', { relayer: relayers[0] })

      await expectRevert(
        AuthereumLoginKeyValidator.addRelayers([relayers[0]], { from: maliciousAccount }),
        constants.REVERT_MSG.O_MUST_BE_OWNER
      )
    })
  })
})
