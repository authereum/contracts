const { expectEvent, expectRevert } = require('@openzeppelin/test-helpers')

const constants = require('../utils/constants.js')
const timeUtils = require('../utils/time.js')
const ArtifactManaged = artifacts.require('Managed')

contract('Managed', function (accounts) {
  const OWNER = accounts[0]
  const RELAYER = accounts[9]
  const AUTH_KEYS = [accounts[1], accounts[2], accounts[3], accounts[4], accounts[5], accounts[6]]
  const RECEIVERS = [accounts[7]]
  const ENS_OWNER = accounts[8]
  const AUTHEREUM_OWNER = accounts[9]
  const LOGIN_KEY = accounts[10]

  // Test Params
  let snapshotId

  before(async () => {
    managedInstance = await ArtifactManaged.new()
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

  describe('addManager', () => {
    context('Happy Path', async () => {
      it('Should add a new manager', async () => {
        var { logs } = await managedInstance.addManager(AUTHEREUM_OWNER)
        expectEvent.inLogs(logs, 'ManagerAdded', { _manager: AUTHEREUM_OWNER })

        const isManager = await managedInstance.managers.call(AUTHEREUM_OWNER)
        assert.equal(isManager, true)
      })
      it('Should do nothing if the same address is set as an owner', async () => {
        var { logs } = await managedInstance.addManager(AUTHEREUM_OWNER)
        expectEvent.inLogs(logs, 'ManagerAdded', { _manager: AUTHEREUM_OWNER })

        const emptyLog = await managedInstance.addManager(AUTHEREUM_OWNER)
        assert.equal('', emptyLog.logs)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not allow 0 to be a manager', async () => {
        await expectRevert(managedInstance.addManager(constants.ZERO_ADDRESS), constants.REVERT_MSG.M_NOT_NULL_ADDRESS)
      })
      it('Should exclusively allow the owner to set a manager', async () => {
        await expectRevert(managedInstance.addManager(AUTHEREUM_OWNER, { from: RELAYER }), constants.REVERT_MSG.O_MUST_BE_OWNER)
      })
    })
  })
  describe('revokeManager', () => {
    context('Happy Path', async () => {
      it('Should remove a manager', async () => {
        await managedInstance.addManager(AUTHEREUM_OWNER)
        var { logs } = await managedInstance.revokeManager(AUTHEREUM_OWNER)
        expectEvent.inLogs(logs, 'ManagerRevoked', { _manager: AUTHEREUM_OWNER })


        const isManager = await managedInstance.managers.call(AUTHEREUM_OWNER)
        assert.equal(isManager, false)
      })
    })
    context('Non-Happy Path', async () => {
      it('Should not remove a manager if said manager is not already set', async () => {
        await expectRevert(managedInstance.revokeManager(AUTHEREUM_OWNER), constants.REVERT_MSG.M_MUST_BE_EXISTING_MANAGER)
      })
      it('Should not remove a manager if the function is not called by the owner', async () => {
        await expectRevert(managedInstance.revokeManager(AUTHEREUM_OWNER, { from: RELAYER }), constants.REVERT_MSG.O_MUST_BE_OWNER)
      })
    })
  })
})
