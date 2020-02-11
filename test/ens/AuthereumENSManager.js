const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const utils = require('../utils/utils')
const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')

const ArtifactBadTransaction = artifacts.require('BadTransaction')
const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const ArtifactAuthereumProxy = artifacts.require('AuthereumProxy')
const ArtifactAuthereumProxyFactory = artifacts.require('AuthereumProxyFactory')
const ArtifactAuthereumProxyAccountUpgrade = artifacts.require('UpgradeAccount')
const ArtifactAuthereumProxyAccountUpgradeWithInit = artifacts.require('UpgradeAccountWithInit')
const AuthereumEnsResolver = artifacts.require('AuthereumEnsResolver')
const AuthereumEnsManager = artifacts.require('AuthereumEnsManager')

var namehash = require('eth-ens-namehash')

contract('AuthereumEnsManager', function (accounts) {
  const ENS_OWNER = accounts[0]
  const AUTHEREUM_OWNER = accounts[1]
  const AUTH_KEYS = [accounts[2], accounts[3], accounts[4], accounts[5]]
  const NEW_PROXY_FACTORY = accounts[6]
  const PROXY_FACTORY = accounts[0]
  
  const timelockContractAddress = '0x6c36a7EE3c2DCA0E1ebE20Fa26c2B76841286eF6' // Arbitrary for now

  // Test Params
  let snapshotId

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
  const unclaimedLabel = 'unclaimed'

  // Domains
  const authereumDotEthDomain = authereumLabel + '.' + ethLabel
  const testDotAuthereumDotEthDomain = testLabel + '.' + authereumLabel + '.' + ethLabel
  const testtwoDotAuthereumDotEthDomain = testtwoLabel + '.' + authereumLabel + '.' + ethLabel
  const unclaimedDotAuthereumDotEthDomain = unclaimedLabel + '.' + authereumLabel + '.' + ethLabel

  // Hashes
  const ethHash = web3.utils.soliditySha3(ethLabel)
  const authereumHash = web3.utils.soliditySha3(authereumLabel)
  const reverseHash = web3.utils.soliditySha3(reverseLabel)
  const addrHash = web3.utils.soliditySha3(addrLabel)
  const testHash = web3.utils.soliditySha3(testLabel)
  const testtwoHash = web3.utils.soliditySha3(testtwoLabel)
  const unclaimedLabelHash = web3.utils.soliditySha3(unclaimedLabel)

  // Nodes
  const ethTldNode = namehash.hash(ethLabel)
  const authereumDotEthNode = namehash.hash(authereumDotEthDomain)
  const reverseTldNode = namehash.hash(reverseLabel)
  const testDotAuthereumDotEthNode = namehash.hash(testDotAuthereumDotEthDomain)
  const testtwoDotAuthereumDotEthNode = namehash.hash(testtwoDotAuthereumDotEthDomain)
  const unclaimedLabelDotAuthereumDotEthNode = namehash.hash(unclaimedDotAuthereumDotEthDomain)

  let ensRegistry,
    ensReverseRegistrar,
    authereumEnsResolver,
    authereumEnsManager,
    project,
    proxyFactory,
    accountProxy,
    proxyFactoryAddress,
    saltHash

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
  let authereumProxy
  let authereumProxyAccount
  let authereumProxyAccountUpgrade
  let authereumProxyAccountUpgradeWithInit

  before(async () => {
    // Set up ENS defaults
    const ensContracts = await utils.setENSDefaults(AUTHEREUM_OWNER)
    ensRegistry = ensContracts.ensRegistry
    ensReverseRegistrar = ensContracts.ensReverseRegistrar
    authereumEnsResolver = ensContracts.authereumEnsResolver
    authereumEnsManager = ensContracts.authereumEnsManager

    // Create Logic Contracts
    authereumAccountLogicContract = await ArtifactAuthereumAccount.new()
    authereumProxyFactoryLogicContract = await ArtifactAuthereumProxyFactory.new(authereumAccountLogicContract.address, authereumEnsManager.address)
    authereumProxyAccountUpgradeLogicContract = await ArtifactAuthereumProxyAccountUpgrade.new()
    authereumProxyAccountUpgradeWithInitLogicContract = await ArtifactAuthereumProxyAccountUpgradeWithInit.new()

    // Set up Authereum ENS Manager defaults
    await utils.setAuthereumENSManagerDefaults(authereumEnsManager, AUTHEREUM_OWNER, authereumProxyFactoryLogicContract.address, constants.AUTHEREUM_PROXY_RUNTIME_CODE_HASH)
    
    // Create default proxies
    label = testLabel
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

    // Declare variables
    proxyFactoryAddress = authereumProxyFactoryLogicContract.address
    saltHash = utils.getSaltHash(constants.SALT, accounts[0])
  });

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

  describe('Sanity Checks', () => {
    context('Happy Path', async () => {
      it('Should set the Authereum ENS Manager as the owner of authereum.eth', async () => {
        const owner = await ensRegistry.owner(authereumDotEthNode);
        assert.equal(owner, authereumEnsManager.address, 'Authereum ENS manager should be the owner of authereum.eth');
      });
      it('Should return the Authereum resolver address for a subdomain', async () => {
        const resolver = await ensRegistry.resolver(testDotAuthereumDotEthNode);
        assert.equal(resolver, authereumEnsResolver.address);
      });
      it('Should return address(0) for the authereumDotEthNode resolver', async () => {
        const resolver = await authereumEnsResolver.addr(authereumDotEthNode);
        assert.equal(resolver, constants.ZERO_ADDRESS);
      });
      it('Should return address(0) for an unclaimed subdomain resolver', async () => {
        const resolver = await authereumEnsResolver.addr(unclaimedLabelDotAuthereumDotEthNode);
        assert.equal(resolver, constants.ZERO_ADDRESS);
      });
    });
  });
  describe("getEnsRegistry", () => {
    context('Happy Path', async () => {
      it('Should return the current registry', async () => {
        const resolver = await authereumEnsManager.getEnsRegistry();
        assert.equal(resolver, ensRegistry.address);
      });
    });
  });
  describe('getEnsReverseRegistrar', () => {
    context('Happy Path', async () => {
      it('Should return the ENS Reverse Registrar', async () => {
        const resolver = await authereumEnsManager.getEnsReverseRegistrar();
        assert.equal(resolver, ensReverseRegistrar.address);
      });
    });
  });
  describe('changeRootnodeOwner', () => {
    context('Happy Path', async () => {
      it('Should update the owner of the rootNode from the manager address to a new manager address', async () => {
        const newAuthereumEnsManager = await AuthereumEnsManager.new(authereumDotEthDomain, authereumDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        let rootnodeOwner = await ensRegistry.owner(authereumDotEthNode)
        assert.equal(rootnodeOwner, authereumEnsManager.address)

        // Change the rootnode owner
        var { logs } = await authereumEnsManager.changeRootnodeOwner(newAuthereumEnsManager.address, { from: AUTHEREUM_OWNER })
        rootnodeOwner = await ensRegistry.owner(authereumDotEthNode)
        assert.equal(rootnodeOwner, newAuthereumEnsManager.address)
        expectEvent.inLogs(logs, 'RootnodeOwnerChanged', { rootnode: authereumDotEthNode, newOwner: newAuthereumEnsManager.address })
      });
    });
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary actor to update the rootnode owner', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeOwner(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      });
      it('Should not allow the rootnode owner to be set to 0', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeOwner(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER  }), constants.REVERT_MSG.AEM_ADDRESS_MUST_NOT_BE_NULL)
      });
    });
  });
  describe('changeRootnodeResolver', () => {
    context('Happy Path', async () => {
      it('Should update the resolver of the rootNode from the manager address to a new resolver', async () => {
        let newAuthereumEnsResolver = await AuthereumEnsResolver.new( ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })
        let rootnodeResolver = await ensRegistry.resolver(authereumDotEthNode)
        assert.equal(rootnodeResolver, constants.ZERO_ADDRESS)

        // Change the rootnode resolver
        var { logs } = await authereumEnsManager.changeRootnodeResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })

        rootnodeResolver = await ensRegistry.resolver(authereumDotEthNode)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        expectEvent.inLogs(logs, 'RootnodeResolverChanged', { rootnode: authereumDotEthNode, newResolver: newAuthereumEnsResolver.address })
      });
    });
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary actor to update the rootnode resolver', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeResolver(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      });
      it('Should not allow the rootnode resolver to be set to 0', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeResolver(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER  }), constants.REVERT_MSG.AEM_ADDRESS_MUST_NOT_BE_NULL)
      });
    });
  });
  describe('changeRootnodeTTL', () => {
    context('Happy Path', async () => {
      it('Should update the TTL of the rootNode from the 0 to 1', async () => {
        let rootnodeTtl = await ensRegistry.ttl(authereumDotEthNode)
        assert.equal(rootnodeTtl, 0)

        // Change the rootnode ttl
        var { logs } = await authereumEnsManager.changeRootnodeTTL(1, { from: AUTHEREUM_OWNER })

        rootnodeTtl = await ensRegistry.ttl(authereumDotEthNode)
        assert.equal(rootnodeTtl, '1')
        expectEvent.inLogs(logs, 'RootnodeTTLChanged', { rootnode: authereumDotEthNode, newTtl: '1'})
      });
    });
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary actor to update the rootnode ttl', async () => {
        await expectRevert(authereumEnsManager.changeRootnodeTTL(1, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      });
    });
  });
  describe("changeRootnodeText", () => {
    context('Happy Path', async () => {
      it("Should update the text record of the rootNode from the 0 to the default key and value", async () => {
        let rootnodeText = await authereumEnsResolver.text(authereumDotEthNode, defaultTextKey)
        assert.equal(rootnodeText, 0)

        // Change the rootnode text
        var { logs } = await authereumEnsManager.changeRootnodeText(defaultTextKey, defaultTextValue, { from: AUTHEREUM_OWNER })

        rootnodeText = await authereumEnsResolver.text(authereumDotEthNode, defaultTextKey)
        assert.equal(rootnodeText, defaultTextValue)
        expectEvent.inLogs(logs, 'RootnodeTextChanged', { node: authereumDotEthNode, indexedKey: defaultTextKeyIndexed, key: defaultTextKey, value: defaultTextValue })
      });
    });
    context('Non-Happy Path', async () => {
      it("Should not allow an arbitrary actor to update the rootnode text", async () => {
        await expectRevert(authereumEnsManager.changeRootnodeText(defaultTextKey, defaultTextValue, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      });
    });
  });
  describe("changeRootnodeContenthash", () => {
    context('Happy Path', async () => {
      it("Should update the contenthash of the rootNode from the null to the default contenthash", async () => {
        let letRootnodeContenthash = await authereumEnsResolver.contenthash(authereumDotEthNode)
        assert.equal(letRootnodeContenthash, null)

        // Change the rootnode contenthash
        var { logs } = await authereumEnsManager.changeRootnodeContenthash(defaultContenthashBytes, { from: AUTHEREUM_OWNER })

        letRootnodeContenthash = await authereumEnsResolver.contenthash(authereumDotEthNode)
        assert.equal(letRootnodeContenthash, defaultContenthashHex)
        expectEvent.inLogs(logs, 'RootnodeContenthashChanged', { node: authereumDotEthNode, hash: defaultContenthashHex })
      });
    });
    context('Non-Happy Path', async () => {
      it("Should not allow an arbitrary actor to update the rootnode contenthash", async () => {
        await expectRevert(authereumEnsManager.changeRootnodeContenthash(defaultContenthashBytes, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      });
    });
  });
  describe("changeAuthereumFactoryAddress", () => {
    context('Happy Path', async () => {
      it('Should update the owner of the Autherereum Factory address to a new Authereum Factory address', async () => {
        var { logs } = await authereumEnsManager.changeAuthereumFactoryAddress(NEW_PROXY_FACTORY, { from: AUTHEREUM_OWNER })
        expectEvent.inLogs(logs, 'AuthereumFactoryAddressChanged', { authereumFactoryAddress: NEW_PROXY_FACTORY })
      });
    });
    context('Non-Happy Path', async () => {
      it('Should not allow an arbitrary actor to update the Authereum Factory address', async () => {
        await expectRevert(authereumEnsManager.changeAuthereumFactoryAddress(NEW_PROXY_FACTORY, { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      });
      it('Should not allow the Authereum Factory address to be set to 0', async () => {
        await expectRevert(authereumEnsManager.changeAuthereumFactoryAddress(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER }), constants.REVERT_MSG.GENERAL_REVERT)
      });
    });
  });
  describe("changeAuthereumEnsResolver", () => {
    context('Happy Path', async () => {
      it('Should update the owner of the ENS Resolver address to a new ENS Resolver address', async () => {
        const newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })
        let resolverAddress = await authereumEnsManager.authereumEnsResolver()
        assert.equal(resolverAddress, authereumEnsResolver.address)

        // Change the ens resolver
        var { logs } = await authereumEnsManager.changeAuthereumEnsResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        resolverAddress = await authereumEnsManager.authereumEnsResolver()
        assert.equal(resolverAddress, newAuthereumEnsResolver.address)
        expectEvent.inLogs(logs, 'AuthereumEnsResolverChanged', { authereumEnsResolver: newAuthereumEnsResolver.address })
      });
    });
    context('Non-Happy Path', async () => {
      it("Should not allow an arbitrary actor to update the ENS Resolver address", async () => {
        await expectRevert(authereumEnsManager.changeAuthereumEnsResolver(AUTH_KEYS[0], { from: AUTH_KEYS[0] }), constants.REVERT_MSG.GENERAL_REVERT)
      });
      it('Should not allow the new ENS resolver address to be set to 0', async () => {
        const newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })
        await expectRevert(authereumEnsManager.changeAuthereumEnsResolver(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER }), constants.REVERT_MSG.GENERAL_REVERT)
      });
    });
  });
  describe('Register', () => {
    context('Happy Path', async () => {
      it('Should let a user register test.authereum.eth', async () => {
        // Check subdomain owner
        const owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        const create2Address = utils.buildCreate2Address(proxyFactoryAddress, saltHash, proxyCodeAndConstructorHash)
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.authereum.eth');

        // Check Resolver
        const resolver = await ensRegistry.resolver(testDotAuthereumDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, 'Resolver address should be the Authereun ENS Resolver address')

        // Check addr
        const addr = await authereumEnsResolver.addr(testDotAuthereumDotEthNode)
        assert.equal(addr, create2Address, 'The Authereum Resolver addr was not set correctly')

        // Check name
        const reverseTestDotAuthereumDotEthNode = await utils.getReverseNode(create2Address)
        const name = await authereumEnsResolver.name(reverseTestDotAuthereumDotEthNode)
        assert.equal(name, testDotAuthereumDotEthDomain, 'The test.authereum.eth name was not set correcly')
      });
      it('Should let a user register test.authereum.eth and another user to register testtwo.authereum.eth', async () => {
        // First user
        let proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        let create2Address = utils.buildCreate2Address(proxyFactoryAddress, saltHash, proxyCodeAndConstructorHash)
        let owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.authereum.eth');
        
        // Second user
        const _expectedSalt = constants.SALT + 10
        const _saltHash = utils.getSaltHash(_expectedSalt, accounts[0])
        const _label = testtwoLabel
        create2Address = utils.buildCreate2Address(proxyFactoryAddress, _saltHash, proxyCodeAndConstructorHash)
        await utils.createProxy(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        owner = await ensRegistry.owner(testtwoDotAuthereumDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of testtwo.authereum.eth');
      });
      // NOTE: This identical name will be normalized and blocked on the frontend
      it('Should let a user register test.authereum.eth and another user register Test.authereum.eth, but ownership will not change because namehash normalizes the names to be the same case', async () => {
        // First user
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        const create2Address = utils.buildCreate2Address(proxyFactoryAddress, saltHash, proxyCodeAndConstructorHash)
        let owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.authereum.eth');

        // Second user
        const _expectedSalt = constants.SALT + 10
        const _label = testtwoLabel
        await utils.createProxy(
          _expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], _label, authereumAccountLogicContract.address
        )

        owner = await ensRegistry.owner(namehash.hash('Test.authereum.eth'));
        assert.equal(owner, create2Address, 'create2Address should be the owner of Test.authereum.eth');
      });
    });
    context('Non-Happy Path', async () => {
      it('Should not allow a domain name to be registered more than once', async () => {
        await expectRevert(utils.createProxy(
          expectedSalt, accounts[0], authereumProxyFactoryLogicContract,
          AUTH_KEYS[0], label, authereumAccountLogicContract.address
        ), constants.REVERT_MSG.GENERAL_REVERT)
      });
      it('Should not allow an non-authereumProxyFactory address to register an account', async () => {
        // Fail from an arbitrary address call
        await expectRevert(authereumEnsManager.register(testLabel, AUTH_KEYS[0], { from: accounts[0] }), constants.REVERT_MSG.AEM_MUST_SEND_FROM_FACTORY)

        // Fail from an Authereum owner call
        await expectRevert(authereumEnsManager.register(testLabel, AUTH_KEYS[0], { from: AUTHEREUM_OWNER }), constants.REVERT_MSG.AEM_MUST_SEND_FROM_FACTORY)
      });
    });
  });
  describe('isAvailable', () => {
    context('Happy Path', async () => {
      it('Should return true if a subnode is available', async () => {
        let isTrue = await authereumEnsManager.isAvailable(unclaimedLabelHash, { from: AUTH_KEYS[0] })
        assert.equal(isTrue, true)
      });
      it('Should return false if a subnode is not available', async () => {
        let isTrue = await authereumEnsManager.isAvailable(testHash, { from: AUTH_KEYS[0] })
        assert.equal(isTrue, false)
      });
    });
  });
  describe('End to End', () => {
    context('Happy Path', async () => {
      it('Should update to a new manager and retain all qualities as before the upgrade', async () => {
        let newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })

        // Set values for original manager
        await authereumEnsManager.changeRootnodeResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        await authereumEnsManager.changeRootnodeTTL(1, { from: AUTHEREUM_OWNER })

        // Get values for original manager
        let rootnodeOwner = await ensRegistry.owner(authereumDotEthNode)
        let rootnodeResolver = await ensRegistry.resolver(authereumDotEthNode)
        let rootnodeTtl = await ensRegistry.ttl(authereumDotEthNode)

        // Confirm original state
        assert.equal(rootnodeOwner, authereumEnsManager.address)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        assert.equal(rootnodeTtl, '1')

        // Update manager
        let newAuthereumEnsManager = await AuthereumEnsManager.new(authereumDotEthDomain, authereumDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        await authereumEnsManager.changeRootnodeOwner(newAuthereumEnsManager.address, { from: AUTHEREUM_OWNER })
        rootnodeOwner = await ensRegistry.owner(authereumDotEthNode)

        // Confirm state after owner switch
        assert.equal(rootnodeOwner, newAuthereumEnsManager.address)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        assert.equal(rootnodeTtl, '1')
      });
      it('Should update to a new manager and retain all qualities as before the upgrade, including users', async () => {
        // Get expected user address
        const proxyCodeAndConstructorHash = await utils.calculateProxyBytecodeAndConstructorHash(authereumAccountLogicContract.address)
        const create2Address = utils.buildCreate2Address(proxyFactoryAddress, saltHash, proxyCodeAndConstructorHash)

        // Check subdomain owner
        let owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.authereum.eth');

        // Check Resolver
        let resolver = await ensRegistry.resolver(testDotAuthereumDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, 'Resolver address should be the Authereun ENS Resolver address')

        // Check addr
        let addr = await authereumEnsResolver.addr(testDotAuthereumDotEthNode)
        assert.equal(addr, create2Address, 'The Authereum Resolver addr was not set correctly')

        // Check name
        let reverseTestDotAuthereumDotEthNode = await utils.getReverseNode(create2Address)
        let name = await authereumEnsResolver.name(reverseTestDotAuthereumDotEthNode)
        assert.equal(name, testDotAuthereumDotEthDomain, 'The test.authereum.eth name was not set correcly')

        // Create new resolver
        const newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })

        // Set values for original manager
        await authereumEnsManager.changeRootnodeResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        await authereumEnsManager.changeRootnodeTTL(1, { from: AUTHEREUM_OWNER })

        // Get values for original manager
        let rootnodeOwner = await ensRegistry.owner(authereumDotEthNode)
        let rootnodeResolver = await ensRegistry.resolver(authereumDotEthNode)
        let rootnodeTtl = await ensRegistry.ttl(authereumDotEthNode)

        // Confirm original state
        assert.equal(rootnodeOwner, authereumEnsManager.address)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        assert.equal(rootnodeTtl, '1')

        // Update manager
        const newAuthereumEnsManager = await AuthereumEnsManager.new(authereumDotEthDomain, authereumDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        await authereumEnsManager.changeRootnodeOwner(newAuthereumEnsManager.address, { from: AUTHEREUM_OWNER })
        rootnodeOwner = await ensRegistry.owner(authereumDotEthNode)

        // Confirm state after owner switch
        assert.equal(rootnodeOwner, newAuthereumEnsManager.address)
        assert.equal(rootnodeResolver, newAuthereumEnsResolver.address)
        assert.equal(rootnodeTtl, '1')

        // Check user attributes
        // Check subdomain owner
        owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, create2Address, 'create2Address should be the owner of test.authereum.eth');

        // Check Resolver
        resolver = await ensRegistry.resolver(testDotAuthereumDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, 'Resolver address should be the Authereun ENS Resolver address')

        // Check addr
        addr = await authereumEnsResolver.addr(testDotAuthereumDotEthNode)
        assert.equal(addr, create2Address, 'The Authereum Resolver addr was not set correctly')

        // Check name
        reverseTestDotAuthereumDotEthNode = await utils.getReverseNode(create2Address)
        name = await authereumEnsResolver.name(reverseTestDotAuthereumDotEthNode)
        assert.equal(name, testDotAuthereumDotEthDomain, 'The test.authereum.eth name was not set correcly')
      });
    });
  });
});
