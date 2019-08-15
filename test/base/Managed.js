const { expectEvent, expectRevert, constants } = require('openzeppelin-test-helpers')
const ArtifactManaged = artifacts.require('Managed')

contract('Owned', function (accounts) {
  const OWNER = accounts[0]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6]]
  const RECEIVERS = [accounts[7]]
  const ENS_OWNER = accounts[8]
  const AUTHEREUM_OWNER = accounts[9]
  const LOGIN_KEY = accounts[10]

  beforeEach(async () => {
    managedInstance = await ArtifactManaged.new()
  })

  //* *******//
  //  Tests //
  //* *****//
  describe('addManager', () => {
    context('Happy Path', async () => {
      it('Should add a new manager', async () => {
        var { logs } = await managedInstance.addManager(AUTHEREUM_OWNER)
        expectEvent.inLogs(logs, "ManagerAdded", { _manager: AUTHEREUM_OWNER })

        var isManager = await managedInstance.managers.call(AUTHEREUM_OWNER)
        assert.equal(isManager, true)
      })
      it('Should do nothing if the same address is set as an owner', async () => {
        var { logs } = await managedInstance.addManager(AUTHEREUM_OWNER)
        expectEvent.inLogs(logs, "ManagerAdded", { _manager: AUTHEREUM_OWNER })

        var emptyLog = await managedInstance.addManager(AUTHEREUM_OWNER)
        assert.equal('', emptyLog.logs)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow 0 to be a manager', async () => {
        await expectRevert(managedInstance.addManager(constants.ZERO_ADDRESS), "Address must not be null")
      })
      it('Should only allow the owner to set a manager', async () => {
        await expectRevert(managedInstance.addManager(AUTHEREUM_OWNER, { from: RELAYER }), "Must be owner")
      })
    })
  })
  describe('revokeManager', () => {
    context('Happy Path', async () => {
      it('Should remove a manager', async () => {
        await managedInstance.addManager(AUTHEREUM_OWNER)
        var { logs } = await managedInstance.revokeManager(AUTHEREUM_OWNER)
        expectEvent.inLogs(logs, "ManagerRevoked", { _manager: AUTHEREUM_OWNER })


        var isManager = await managedInstance.managers.call(AUTHEREUM_OWNER)
        assert.equal(isManager, false)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not remove a manager if said manager is not already set', async () => {
        await expectRevert(managedInstance.revokeManager(AUTHEREUM_OWNER), "Target must be an existing manager")
      })
      it('Should not remove a manager if the function is not called by the owner', async () => {
        await expectRevert(managedInstance.revokeManager(AUTHEREUM_OWNER, { from: RELAYER }), "Must be owner")
      })
    })
  })
})
