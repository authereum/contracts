const { TestHelper } = require('zos')
const { Contracts, ZWeb3 } = require('zos-lib')
const { expectRevert } = require('openzeppelin-test-helpers')

const { setENSDefaults } = require('../utils/utils')

ZWeb3.initialize(web3.currentProvider)

const ArtifactAuthereumAccount = artifacts.require('AuthereumAccount')
const AuthereumAccount = Contracts.getFromLocal('AuthereumAccount')

contract('AuthereumAccount', function (accounts) {
  const ENS_OWNER = accounts[0]
  const AUTHEREUM_OWNER = accounts[1]
  const AUTH_KEYS = [accounts[2], accounts[3], accounts[4], accounts[5]]

  let authereumEnsManager

  beforeEach(async function () {
    project = await TestHelper()

    // Set up ENS defaults
    const ensContracts = await setENSDefaults(AUTHEREUM_OWNER, ENS_OWNER)
    authereumEnsManager = ensContracts.authereumEnsManager
  })

  describe('initialize', () => {
    context('Happy path', () => {
      it('Should initialize an upgradable contract', async () => {
        accountProxy = await project.createProxy(
          AuthereumAccount, {initMethod: 'initialize', initArgs: [AUTH_KEYS[0], authereumEnsManager.address, "myName"]}
        )

        // Wrap proxy in truffle-contract
        accountProxy = await ArtifactAuthereumAccount.at(accountProxy.address)

        // Should set the Chain ID to 1
        chainId = await accountProxy.CHAIN_ID()
        assert(chainId, 1)

        // Should add the sender as an authKey
        isAuthKey = await accountProxy.authKeys(AUTH_KEYS[0])
        assert.equal(isAuthKey, true)
        numAuthKeys = await accountProxy.getAuthKeysArrayLength()
        assert.equal(numAuthKeys, 1)
        authKey = await accountProxy.authKeysArray(0)
        assert.equal(authKey, AUTH_KEYS[0])
      })
    })
    context('Non-Happy path', () => {
      it('Should not initialize an upgradable contract because a _label has already been used', async () => {
        await project.createProxy(
          AuthereumAccount, {initMethod: 'initialize', initArgs: [AUTH_KEYS[0], authereumEnsManager.address, "myName"]}
        )
        await expectRevert.unspecified(project.createProxy(
          AuthereumAccount, {initMethod: 'initialize', initArgs: [AUTH_KEYS[1], authereumEnsManager.address, "myName"]}
        ))
      })
    })
  })
})
