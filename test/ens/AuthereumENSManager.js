const { zos_constants, expectEvent, expectRevert, constants} = require('openzeppelin-test-helpers')
const { setENSDefaults } = require('../utils/utils')

const AuthereumEnsResolver = artifacts.require('AuthereumEnsResolver')
const AuthereumEnsManager = artifacts.require('AuthereumEnsManager')

var namehash = require('eth-ens-namehash')

contract("AuthereumEnsManager", function (accounts) {
  const ENS_OWNER = accounts[0]
  const AUTHEREUM_OWNER = accounts[1]
  const USERS = [accounts[2], accounts[3], accounts[4], accounts[5]]

  const ADDR_REVERSE_NODE = '0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2'
  const timelockContractAddress = '0x6c36a7EE3c2DCA0E1ebE20Fa26c2B76841286eF6' // Arbitrary for now
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
    ensRegistry = ensContracts.ensRegistry
    ensReverseRegistrar = ensContracts.ensReverseRegistrar
    authereumEnsResolver = ensContracts.authereumEnsResolver
    authereumEnsManager = ensContracts.authereumEnsManager
  });

  describe("Sanity Checks", () => {
    context('Happy Path', async () => {
      it("Should set the Authereum ENS Manager as the owner of authereum.eth", async () => {
        var owner = await ensRegistry.owner(authereumDotEthNode);
        assert.equal(owner, authereumEnsManager.address, "Authereum ENS manager should be the owner of authereum.eth");
      });
      it("Should return the Authereum resolver address for a subdomain", async () => {
        await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })
        var resolver = await ensRegistry.resolver(testDotAuthereumDotEthNode);
        assert.equal(resolver, authereumEnsResolver.address);
      });
      it("Should return address(0) for the authereumDotEthNode resolver", async () => {
        var resolver = await authereumEnsResolver.addr(authereumDotEthNode);
        assert.equal(resolver, constants.ZERO_ADDRESS);
      });
      it("Should return address(0) for an unclaimed subdomain resolver", async () => {
        var resolver = await authereumEnsResolver.addr(testDotAuthereumDotEthNode);
        assert.equal(resolver, constants.ZERO_ADDRESS);
      });
    });
  });
  describe("resolveEns", () => {
    context('Happy Path', async () => {
      it("Should return the address of the owner of a subdomain", async () => {
        await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })
        var userZeroAddress = await authereumEnsManager.resolveEns.call(testDotAuthereumDotEthNode);
        assert.equal(userZeroAddress, USERS[0]);
      });
      it("Should throw for authereumDotEthNode because resolver evaluates to address(0)", async () => {
        await expectRevert.unspecified(authereumEnsManager.resolveEns(authereumDotEthNode));
      });
      it("Should throw for an unclaimed subdomain because resovler evalueates to address(0)", async () => {
        await expectRevert.unspecified(authereumEnsManager.resolveEns(testDotAuthereumDotEthNode));
      });
    });
  });
  describe("getEnsRegistry", () => {
    context('Happy Path', async () => {
      it("Should return the current registry", async () => {
        var resolver = await authereumEnsManager.getEnsRegistry();
        assert.equal(resolver, ensRegistry.address);
      });
    });
  });
  describe("getEnsReverseRegistrar", () => {
    context('Happy Path', async () => {
      it("Should return the ENS Reverse Registrar", async () => {
        var resolver = await authereumEnsManager.getEnsReverseRegistrar();
        assert.equal(resolver, ensReverseRegistrar.address);
      });
    });
  });
  describe("changeRootnodeOwner", () => {
    context('Happy Path', async () => {
      it("Should update the owner of the rootNode from the manager address to a new manager address", async () => {
        let newAuthereumEnsManager = await AuthereumEnsManager.new(authereumDotEthDomain, authereumDotEthNode, ensRegistry.address, authereumEnsResolver.address, { from: AUTHEREUM_OWNER })
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
      it("Should not allow an arbitrary actor to update the rootnode owner", async () => {
        await expectRevert.unspecified(authereumEnsManager.changeRootnodeOwner(USERS[0], { from: USERS[0] }))
      });
      it("Should not allow the rootnode owner to be set to 0", async () => {
        await expectRevert(authereumEnsManager.changeRootnodeOwner(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER  }), "Address cannot be null")
      });
    });
  });
  describe("changeRootnodeResolver", () => {
    context('Happy Path', async () => {
      it("Should update the resolver of the rootNode from the manager address to a new resolver", async () => {
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
      it("Should not allow an arbitrary actor to update the rootnode resolver", async () => {
        await expectRevert.unspecified(authereumEnsManager.changeRootnodeResolver(USERS[0], { from: USERS[0] }))
      });
      it("Should not allow the rootnode resolver to be set to 0", async () => {
        await expectRevert(authereumEnsManager.changeRootnodeResolver(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER  }), "Address cannot be null")
      });
    });
  });
  describe("changeRootnodeTTL", () => {
    context('Happy Path', async () => {
      it("Should update the TTL of the rootNode from the 0 to 1", async () => {
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
      it("Should not allow an arbitrary actor to update the rootnode ttl", async () => {
        await expectRevert.unspecified(authereumEnsManager.changeRootnodeTTL(1, { from: USERS[0] }))
      });
    });
  });
  describe("changeEnsResolver", () => {
    context('Happy Path', async () => {
      it("Should update the owner of the ENS Resolver address to a new ENS Resolver address", async () => {
        newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })
        let resolverAddress = await authereumEnsManager.authereumEnsResolver()
        assert.equal(resolverAddress, authereumEnsResolver.address)

        // Change the ens resolver
        var { logs } = await authereumEnsManager.changeEnsResolver(newAuthereumEnsResolver.address, { from: AUTHEREUM_OWNER })
        resolverAddress = await authereumEnsManager.authereumEnsResolver()
        assert.equal(resolverAddress, newAuthereumEnsResolver.address)
        expectEvent.inLogs(logs, 'AuthereumEnsResolverChanged', { addr: newAuthereumEnsResolver.address })
      });
    });
    context('Non-Happy Path', async () => {
      it("Should not allow an arbitrary actor to update the ENS Resolver address", async () => {
        await expectRevert.unspecified(authereumEnsManager.changeEnsResolver(USERS[0], { from: USERS[0] }))
      });
      it("Should not allow the new ENS resolver address to be set to 0", async () => {
        newAuthereumEnsResolver = await AuthereumEnsResolver.new(ensRegistry.address, timelockContractAddress, { from: AUTHEREUM_OWNER })
        await expectRevert.unspecified(authereumEnsManager.changeEnsResolver(constants.ZERO_ADDRESS, { from: AUTHEREUM_OWNER }))
      });
    });
  });
  describe("Register", () => {
    context('Happy Path', async () => {
      it("Should let a user register test.authereum.eth", async () => {
        var { logs } = await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })

        // Check subdomain owner
        var owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, USERS[0], "USERS[0] should be the owner of test.authereum.eth");

        // Check Resolver
        var resolver = await ensRegistry.resolver(testDotAuthereumDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, "Resolver address should be the Authereun ENS Resolver address")

        // Check addr
        var addr = await authereumEnsResolver.addr(testDotAuthereumDotEthNode)
        assert.equal(addr, USERS[0], "The Authereum Resolver addr was not set correctly")

        // Check name
        var name = await authereumEnsResolver.name(reverseTestDotAuthereumDotEthNode)
        assert.equal(name, testDotAuthereumDotEthDomain, "The test.authereum.eth name was not set correcly")

        // Check events
        expectEvent.inLogs(logs, 'Registered', { owner: USERS[0], ens: testDotAuthereumDotEthDomain })
      });
      it("Should let a user register test.authereum.eth for USER[1]", async () => {
        await authereumEnsManager.register(testLabel, USERS[1], { from: USERS[0] })
        var owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, USERS[1], "USERS[1] should be the owner of test.authereum.eth");
      });
      it("Should let a user register test.authereum.eth and another user to register testtwo.authereum.eth", async () => {
        await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })
        var owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, USERS[0], "USERS[0] should be the owner of test.authereum.eth");
        await authereumEnsManager.register(testtwoLabel, USERS[1], { from: USERS[1] })
        owner = await ensRegistry.owner(testtwoDotAuthereumDotEthNode);
        assert.equal(owner, USERS[1], "USERS[1] should be the owner of testtwo.authereum.eth");
      });
      it("Should let a user register test.authereum.eth and the same user to register testtwo.authereum.eth", async () => {
        await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })
        var owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, USERS[0], "USERS[0] should be the owner of test.authereum.eth");
        await authereumEnsManager.register(testtwoLabel, USERS[0], { from: USERS[0] })
        owner = await ensRegistry.owner(testtwoDotAuthereumDotEthNode);
        assert.equal(owner, USERS[0], "USERS[0] should be the owner of testtwo.authereum.eth");
      });
      // NOTE: This identical name will be normalized and blocked on the frontend
      it("Should let a user register test.authereum.eth and Test.authereum.eth, but ownership will not change because namehash normalizes the names to be the same case", async () => {
        await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })
        var owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, USERS[0], "USERS[0] should be the owner of test.authereum.eth");
        await authereumEnsManager.register("Test", USERS[1], { from: USERS[1] })
        owner = await ensRegistry.owner(namehash.hash("Test.authereum.eth"));
        assert.equal(owner, USERS[0], "USERS[0] should be the owner of Test.authereum.eth");
      });
    });
    context('Non-Happy Path', async () => {
      it("Should not allow a domain name to be registered more than onece", async () => {
        await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })
        await expectRevert(authereumEnsManager.register(testLabel, USERS[0], { from: USERS[1] }), "Label is already owned")
      });
    });
  });
  describe("isAvailable", () => {
    context('Happy Path', async () => {
      it("Should return true if a subnode is available", async () => {
        let isTrue = await authereumEnsManager.isAvailable(testHash, { from: USERS[0] })
        assert.equal(isTrue, true)
      });
      it("Should return false if a subnode is not available", async () => {
        await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })
        let isTrue = await authereumEnsManager.isAvailable(testHash, { from: USERS[0] })
        assert.equal(isTrue, false)
      });
    });
  });
  describe("End to End", () => {
    context('Happy Path', async () => {
      it("Should update to a new manager and retain all qualities as before the upgrade", async () => {
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
      it("Should update to a new manager and retain all qualities as before the upgrade, including users", async () => {
        // Add a user to the original owner
        await authereumEnsManager.register(testLabel, USERS[0], { from: USERS[0] })

        // Check subdomain owner
        var owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, USERS[0], "USERS[0] should be the owner of test.authereum.eth");

        // Check Resolver
        var resolver = await ensRegistry.resolver(testDotAuthereumDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, "Resolver address should be the Authereun ENS Resolver address")

        // Check addr
        var addr = await authereumEnsResolver.addr(testDotAuthereumDotEthNode)
        assert.equal(addr, USERS[0], "The Authereum Resolver addr was not set correctly")

        // Check name
        var name = await authereumEnsResolver.name(reverseTestDotAuthereumDotEthNode)
        assert.equal(name, testDotAuthereumDotEthDomain, "The test.authereum.eth name was not set correcly")
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

        // Check user attributes
        // Check subdomain owner
        var owner = await ensRegistry.owner(testDotAuthereumDotEthNode);
        assert.equal(owner, USERS[0], "USERS[0] should be the owner of test.authereum.eth");

        // Check Resolver
        var resolver = await ensRegistry.resolver(testDotAuthereumDotEthNode)
        assert.equal(resolver, authereumEnsResolver.address, "Resolver address should be the Authereun ENS Resolver address")

        // Check addr
        var addr = await authereumEnsResolver.addr(testDotAuthereumDotEthNode)
        assert.equal(addr, USERS[0], "The Authereum Resolver addr was not set correctly")

        // Check name
        var name = await authereumEnsResolver.name(reverseTestDotAuthereumDotEthNode)
        assert.equal(name, testDotAuthereumDotEthDomain, "The test.authereum.eth name was not set correcly")
      });
    });
  });
});
