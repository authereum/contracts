const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

var namehash = require('eth-ens-namehash')

contract('AuthereumEnsResolver', function (accounts) {
  const ENS_OWNER = accounts[0]
  const AUTHEREUM_OWNER = accounts[1]
  const USERS = [accounts[2], accounts[3], accounts[4], accounts[5]]
  const MOCK_FACTORY_ADDRESS = accounts[9]

  const ADDR_REVERSE_NODE = '0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2'
  const timelockContractAddress = '0x6c36a7EE3c2DCA0E1ebE20Fa26c2B76841286eF6' // Arbitrary for now

  // Test Params
  let snapshotId

  // Desired Values
  const mockBytes = '0x'
  const desiredContenthash = '0x1234'
  const desiredAbiContentType = 1
  const desiredAbiData = '0x5678'
  const desiredPubkeyX = '0x0000000000000000000000000000000000000000000000000000000000000001'
  const desiredPubkeyY = '0x0000000000000000000000000000000000000000000000000000000000000002'
  const desiredTextKey = 'Hello'
  const desiredTextValue = 'World'

  // Interfaces
  const interfaceMetaId = '0x01ffc9a7'
  const addrInterfaceId = '0x3b3b57de'
  const nameInterfaceId = '0x691f3431'
  const textInterfaceId = '0x59d1d43c'
  const contenthashInterfaceId = '0xbc1c58d1'

  // Default Params
  const defaultTextKey = 'test'
  const defaultTextKeyIndexed = web3.utils.soliditySha3(defaultTextKey)
  const defaultTextValue = 'pass'
  const defaultContenthashString = '/ipfs/QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG'
  const defaultContenthashHex = web3.utils.toHex(defaultContenthashString)
  const defaultContenthashBytes = web3.utils.hexToBytes(defaultContenthashHex)

  // Labels
  const ethLabel = 'eth'
  const authereumLabel = 'authereum'
  const reverseLabel = 'reverse'
  const addrLabel = 'addr'
  const testLabel = 'test'
  const testtwoLabel = 'testtwo'

  // Domains
  const authereumDotEthDomain = authereumLabel + '.' + ethLabel
  const testDotAuthereumDotEthDomain = testLabel + '.' + authereumLabel + '.' + ethLabel
  const testtwoDotAuthereumDotEthDomain = testtwoLabel + '.' + authereumLabel + '.' + ethLabel

  // Hashes
  const ethHash = web3.utils.soliditySha3(ethLabel)
  const authereumHash = web3.utils.soliditySha3(authereumLabel)
  const reverseHash = web3.utils.soliditySha3(reverseLabel)
  const addrHash = web3.utils.soliditySha3(addrLabel)
  const testHash = web3.utils.soliditySha3(testLabel)
  const testtwoHash = web3.utils.soliditySha3(testtwoLabel)

  // Nodes
  const ethTldNode = namehash.hash(ethLabel)
  const authereumDotEthNode = namehash.hash(authereumDotEthDomain)
  const reverseTldNode = namehash.hash(reverseLabel)
  const testDotAuthereumDotEthNode = namehash.hash(testDotAuthereumDotEthDomain)
  const testtwoDotAuthereumDotEthNode = namehash.hash(testtwoDotAuthereumDotEthDomain)

  let ensRegistry
  let ensReverseRegistrar
  let authereumEnsResolver
  let authereumEnsManager

  before(async () => {
    // Set up ENS defaults
    const ensContracts = await utils.setENSDefaults(AUTHEREUM_OWNER)
    ensReverseRegistrar = ensContracts.ensReverseRegistrar
    authereumEnsResolver = ensContracts.authereumEnsResolver
    authereumEnsManager = ensContracts.authereumEnsManager

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, MOCK_FACTORY_ADDRESS, mockBytes)
  })

  // Take snapshot before each test and revert after each test
  beforeEach(async() => {
    snapshotId = await timeUtils.takeSnapshot()
  })

  afterEach(async() => {
    await timeUtils.revertSnapshot(snapshotId.result)
  })

  //**********//
  //  Tests  //
  //********//

  describe('name', () => {
    context('Happy path', () => {
      it('Should return the name of the contract', async () => {
        // This contract does not have a `name` variable that defines the
        // contract name because it also includes a name() variable
        // for the ENS logic.
      })
    })
  })
  describe('version', () => {
    context('Happy path', () => {
      it('Should return the version of the contract', async () => {
        const _version = await authereumEnsResolver.version.call()
        const _contractVersions = constants.CONTRACTS.AUTHEREUM_ENS_RESOLVER.VERSIONS
        const _latestVersionIndex = _contractVersions.length - 1
        assert.equal(_version, _contractVersions[_latestVersionIndex])
      })
    })
  })
  describe('setAddr', () => {
    context('Happy Path', async () => {
      it('Should allow a manager (multisig) to setAddr', async () => {
        var { logs } = await authereumEnsResolver.setAddr(testDotAuthereumDotEthNode, USERS[2], { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'AddrChanged', { node: testDotAuthereumDotEthNode, a: USERS[2] })

        const isAddrChanged = await authereumEnsResolver.addr.call(testDotAuthereumDotEthNode)
        assert.equal(isAddrChanged, USERS[2])
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow an owner to change their addr', async () => {
        await expectRevert(authereumEnsResolver.setAddr(testDotAuthereumDotEthNode, USERS[2], { from: USERS[0] }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
      })
      it('Should not allow an arbitrary user to change an addr', async () => {
        await expectRevert(authereumEnsResolver.setAddr(testDotAuthereumDotEthNode, USERS[2], { from: USERS[2] }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
      })
    })
  })
  describe('setName', () => {
    context('Happy Path', async () => {
      it('Should allow a manager (multisig) to setName', async () => {
        var { logs } = await authereumEnsResolver.setName(testDotAuthereumDotEthNode, USERS[2], { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'NameChanged', { node: testDotAuthereumDotEthNode, name: USERS[2] })

        const isNameChanged = await authereumEnsResolver.name.call(testDotAuthereumDotEthNode)
        assert.equal(isNameChanged, USERS[2])
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow an owner to change their name', async () => {
        await expectRevert(authereumEnsResolver.setName(testDotAuthereumDotEthNode, USERS[2], { from: USERS[0] }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
      })
      it('Should not allow an arbitrary user to change an name', async () => {
        await expectRevert(authereumEnsResolver.setName(testDotAuthereumDotEthNode, USERS[2], { from: USERS[2] }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
      })
    })
  })
  describe("setText", () => {
    context('Happy Path', async () => {
      it("Should allow a manager (multisig) to setText", async () => {
        var { logs } = await authereumEnsResolver.setText(testDotAuthereumDotEthNode, defaultTextKey, defaultTextValue, { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'TextChanged', { node: testDotAuthereumDotEthNode, indexedKey: defaultTextKeyIndexed, key: defaultTextKey, value: defaultTextValue })

        const newTextValue = await authereumEnsResolver.text.call(testDotAuthereumDotEthNode, defaultTextKey)
        assert.equal(newTextValue, defaultTextValue)
      })
    })
    context('Non-Happy Path', async () => {
      it("Should not allow an owner to change their text", async () => {
        await expectRevert(authereumEnsResolver.setText(testDotAuthereumDotEthNode, defaultTextKey, defaultTextValue, { from: USERS[0] }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
      })
      it("Should not allow an arbitrary user to change a text", async () => {
        await expectRevert(authereumEnsResolver.setText(testDotAuthereumDotEthNode, defaultTextKey, defaultTextValue, { from: USERS[2] }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
      })
    })
  })
  describe("setContenthash", () => {
    context('Happy Path', async () => {
      it("Should allow a manager (multisig) to setContenthash", async () => {
        var { logs } = await authereumEnsResolver.setContenthash(testDotAuthereumDotEthNode, defaultContenthashBytes, { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'ContenthashChanged', { node: testDotAuthereumDotEthNode, hash: defaultContenthashHex })

        const isNewContenthash = await authereumEnsResolver.contenthash.call(testDotAuthereumDotEthNode)
        assert.equal(isNewContenthash, defaultContenthashHex)
      })
    })
    context('Non-Happy Path', async () => {
      it("Should not allow an owner to change their contenthash", async () => {
        await expectRevert(authereumEnsResolver.setContenthash(testDotAuthereumDotEthNode, defaultContenthashBytes, { from: USERS[0] }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
      })
      it("Should not allow an arbitrary user to change a contenthash", async () => {
        await expectRevert(authereumEnsResolver.setContenthash(testDotAuthereumDotEthNode, defaultContenthashBytes, { from: USERS[2] }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
      })
    })
  })
  describe('supportsInterface', () => {
    context('Happy Path', async () => {
      it('Should return true for meta interface', async () => {
        const res = await authereumEnsResolver.supportsInterface(interfaceMetaId)
        assert.equal(res, true)
      })
      it('Should return true for addr interface', async () => {
        const res = await authereumEnsResolver.supportsInterface(addrInterfaceId)
        assert.equal(res, true)
      })
      it('Should return true for name interface', async () => {
        const res = await authereumEnsResolver.supportsInterface(nameInterfaceId)
        assert.equal(res, true)
      })
      it("Should return true for text interface", async () => {
        const res = await authereumEnsResolver.supportsInterface(textInterfaceId)
        assert.equal(res, true)
      })
      it("Should return true for contenthash", async () => {
        const res = await authereumEnsResolver.supportsInterface(contenthashInterfaceId)
        assert.equal(res, true)
      })
    })
  })
  describe('End to end', () => {
    context('Happy Path', async () => {
      it('Should allow a manager (multisig) to setAddr, remove the manager, add another manager, and add setAddr for another account', async () => {
        var { logs } = await authereumEnsResolver.setAddr(testDotAuthereumDotEthNode, USERS[2], { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'AddrChanged', { node: testDotAuthereumDotEthNode, a: USERS[2] })

        const isAddrChanged = await authereumEnsResolver.addr.call(testDotAuthereumDotEthNode)
        assert.equal(isAddrChanged, USERS[2])

        await authereumEnsResolver.revokeManager(AUTHEREUM_OWNER, { from: AUTHEREUM_OWNER })
        await authereumEnsResolver.addManager(ENS_OWNER, { from: AUTHEREUM_OWNER })

        await expectRevert(authereumEnsResolver.setAddr(testtwoDotAuthereumDotEthNode, USERS[3], { from: AUTHEREUM_OWNER }), constants.REVERT_MSG.M_MUST_BE_MANAGER)
        var { logs } = await authereumEnsResolver.setAddr(testtwoDotAuthereumDotEthNode, USERS[3], { from: ENS_OWNER })
        expectEvent.inLogs(logs, 'AddrChanged', { node: testtwoDotAuthereumDotEthNode, a: USERS[3] })
      })
    })
  })
})
