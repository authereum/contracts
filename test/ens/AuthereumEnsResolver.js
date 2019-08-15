const { zos_constants, expectEvent, expectRevert, constants} = require('openzeppelin-test-helpers')
const { setENSDefaults } = require('../utils/utils')

const AuthereumEnsResolver = artifacts.require('AuthereumEnsResolver')
const AuthereumEnsManager = artifacts.require('AuthereumEnsManager')

var namehash = require('eth-ens-namehash')

contract("AuthereumEnsResolver", function (accounts) {
  const ENS_OWNER = accounts[0]
  const AUTHEREUM_OWNER = accounts[1]
  const USERS = [accounts[2], accounts[3], accounts[4], accounts[5]]

  const ADDR_REVERSE_NODE = '0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2'
  const timelockContractAddress = '0x6c36a7EE3c2DCA0E1ebE20Fa26c2B76841286eF6' // Arbitrary for now

  // Desired Values
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
  const contenthashInterfaceId = '0xbc1c58d1'
  const abiInterfaceId = '0x2203ab56'
  const pubkeyInterfaceId = '0xc8690233' 
  const textInterfaceId = '0x59d1d43c'

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

  // Reverse Nodes
    var sha3HexAddressUserZero= web3.utils.soliditySha3( 
      { t: 'string', v: USERS[0].slice(2).toLowerCase() }
    )

  const reverseTestDotAuthereumDotEthNode = web3.utils.soliditySha3(
    { t: 'bytes32', v: ADDR_REVERSE_NODE },
    { t: 'bytes32', v: sha3HexAddressUserZero}
  )

  let ensRegistry,
    ensReverseRegistrar,
    authereumEnsResolver,
    authereumEnsManager

  beforeEach(async () => {
    // Set up ENS defaults
    const ensContracts = await setENSDefaults(AUTHEREUM_OWNER, ENS_OWNER)
    ensReverseRegistrar = ensContracts.ensReverseRegistrar
    authereumEnsResolver = ensContracts.authereumEnsResolver
    authereumEnsManager = ensContracts.authereumEnsManager

    await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })
    await authereumEnsManager.register(testtwoLabel, USERS[1], { from: USERS[1] })
  });

  describe("setAddr", () => {
    context('Happy Path', async () => {
      it("Should allow a manager (multisig) to setAddr", async () => {
        var { logs } = await authereumEnsResolver.setAddr(testDotAuthereumDotEthNode, USERS[2], { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'AddrChanged', { node: testDotAuthereumDotEthNode, a: USERS[2] })

        var isAddrChanged = await authereumEnsResolver.addr.call(testDotAuthereumDotEthNode)
        assert.equal(isAddrChanged, USERS[2])
      });
    });
    context('Non-Happy Path', async () => {
      it("Should not allow an owner to change their addr", async () => {
        await expectRevert(authereumEnsResolver.setAddr(testDotAuthereumDotEthNode, USERS[2], { from: USERS[0] }), "Must be manage")
      });
      it("Should not allow an arbitrary user to change an addr", async () => {
        await expectRevert(authereumEnsResolver.setAddr(testDotAuthereumDotEthNode, USERS[2], { from: USERS[2] }), "Must be manage")
      });
    });
  });
  describe("setName", () => {
    context('Happy Path', async () => {
      it("Should allow a manager (multisig) to setName", async () => {
        var { logs } = await authereumEnsResolver.setName(testDotAuthereumDotEthNode, USERS[2], { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'NameChanged', { node: testDotAuthereumDotEthNode, name: USERS[2] })

        var isNameChanged = await authereumEnsResolver.name.call(testDotAuthereumDotEthNode)
        assert.equal(isNameChanged, USERS[2])
      });
    });
    context('Non-Happy Path', async () => {
      it("Should not allow an owner to change their name", async () => {
        await expectRevert(authereumEnsResolver.setName(testDotAuthereumDotEthNode, USERS[2], { from: USERS[0] }), "Must be manage")
      });
      it("Should not allow an arbitrary user to change an name", async () => {
        await expectRevert(authereumEnsResolver.setName(testDotAuthereumDotEthNode, USERS[2], { from: USERS[2] }), "Must be manage")
      });
    });
  });
  describe("supportsInterface", () => {
    context('Happy Path', async () => {
      it("Should return true for meta interface", async () => {
        var res = await authereumEnsResolver.supportsInterface(interfaceMetaId)
        assert.equal(res, true)
      }); 
      it("Should return true for addr interface", async () => {
        var res = await authereumEnsResolver.supportsInterface(addrInterfaceId)
        assert.equal(res, true)
      }); 
      it("Should return true for name interface", async () => {
        var res = await authereumEnsResolver.supportsInterface(nameInterfaceId)
        assert.equal(res, true)
      }); 
    });
  });
  describe("End to end", () => {
    context('Happy Path', async () => {
      it("Should allow a manager (multisig) to setAddr, remove the manager, add another manager, and add setAddr for another account", async () => {
        var { logs } = await authereumEnsResolver.setAddr(testDotAuthereumDotEthNode, USERS[2], { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'AddrChanged', { node: testDotAuthereumDotEthNode, a: USERS[2] })

        var isAddrChanged = await authereumEnsResolver.addr.call(testDotAuthereumDotEthNode)
        assert.equal(isAddrChanged, USERS[2])

        await authereumEnsResolver.revokeManager(AUTHEREUM_OWNER, { from: AUTHEREUM_OWNER })
        await authereumEnsResolver.addManager(ENS_OWNER, { from: AUTHEREUM_OWNER })

        await expectRevert(authereumEnsResolver.setAddr(testtwoDotAuthereumDotEthNode, USERS[3], { from: AUTHEREUM_OWNER }), "Must be manage")
        var { logs } = await authereumEnsResolver.setAddr(testtwoDotAuthereumDotEthNode, USERS[3], { from: ENS_OWNER })
        expectEvent.inLogs(logs, 'AddrChanged', { node: testtwoDotAuthereumDotEthNode, a: USERS[3] })
      });
    });
  });
});
