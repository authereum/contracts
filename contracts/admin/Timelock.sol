pragma solidity 0.5.16;

import "../base/Owned.sol";

/**
 * @title Timelock
 * @author Authereum Labs, Inc.
 * @dev Used to make changes to contracts with a known time lock.
 * @dev The goal of this contract is to make the public aware of contract changes made
 * @dev by the contract owners. This will keep the owners honest and will allow the
 * @dev users of the contracts to remove any funds if they suspect any foul play.
 */

contract Timelock is Owned {

    uint256 public timelock;
    uint256 public timelockExpire;
    enum ChangeState {Uninitialized, Pending, Changeable, Expired}

    struct ContractChangeTime{
        uint256 unlockTime;
        uint256 unlockExpireTime;
    }

    event TimelockUpdated(uint256 indexed newTimelock);
    event TimelockExpireUpdated(uint256 indexed newTimelockExpire);
    event ChangeInitiated(bytes data, address indexed changeAddress, uint256 changeTime);
    event ChangeExecuted(bytes data, address indexed changeAddress, uint256 changeTime);
    event ChangeCancelled(bytes data, address indexed changeAddress, uint256 changeTime);

    mapping(bytes => mapping(address => ContractChangeTime)) public changes;

    modifier onlyThisContract {
        require(msg.sender == address(this), "T: Only this contract can call this function");
        _;
    }

    /// @param _timelock Amount of time that a pending change is locked for
    /// @param _timelockExpire Amoutn of time AFTER timelock that data is changeable before expiring
    constructor(uint256 _timelock, uint256 _timelockExpire) public {
        timelock = _timelock;
        timelockExpire = _timelockExpire;
        emit TimelockUpdated(timelock);
        emit TimelockExpireUpdated(timelockExpire);
    }

    /**
     * Getters
     */

    /// @dev Get unlock time of change
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    /// @return The unlock time of the transaction
    function getUnlockTime(bytes memory _data, address _changeAddress) public view returns (uint256) {
        return changes[_data][_changeAddress].unlockTime;
    }

    /// @dev Get the expiration time of change
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    /// @return The unlock expire time of the transaction
    function getUnlockExpireTime(bytes memory _data, address _changeAddress) public view returns (uint256) {
        return changes[_data][_changeAddress].unlockExpireTime;
    }

    /// @dev Get remaining time until change can be made
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    /// @return The remaining unlock time of the transaction
    function getRemainingUnlockTime(bytes memory _data, address _changeAddress) public view returns (uint256) {
        uint256 unlockTime = changes[_data][_changeAddress].unlockTime;
        if (unlockTime <= block.timestamp) {
            return 0;
        }

        return unlockTime - block.timestamp;
    }

    /// @dev Get remaining time until change will expire
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    /// @return The remaining unlock expire time of the transaction
    function getRemainingUnlockExpireTime(bytes memory _data, address _changeAddress) public view returns (uint256) {
        uint256 unlockTime = changes[_data][_changeAddress].unlockTime;
        if (unlockTime <= block.timestamp) {
            return 0;
        }

        return unlockTime - block.timestamp;
    }

    /// @dev Get the current state of some data
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    /// @return The change state of the transaction
    function getCurrentChangeState(bytes memory _data, address _changeAddress) public view returns (ChangeState) {
        uint256 unlockTime = changes[_data][_changeAddress].unlockTime;
        uint256 unlockExpireTime = changes[_data][_changeAddress].unlockExpireTime;
        if (unlockTime == 0) {
            return ChangeState.Uninitialized;
        } else if (block.timestamp < unlockTime) {
            return ChangeState.Pending;
        } else if (unlockTime <= block.timestamp && block.timestamp < unlockExpireTime) {
            return ChangeState.Changeable;
        } else if (unlockExpireTime <= block.timestamp) {
            return ChangeState.Expired;
        }
    }

    /**
     * Setters
     */

    /// @dev Sets a new timelock
    /// @notice Can only be called by self
    /// @param _timelock New timelock time
    function setTimelock(uint256 _timelock) public onlyThisContract {
        timelock = _timelock;
        emit TimelockUpdated(timelock);
    }

    /// @dev Sets a new timelock exipration
    /// @notice Can only be called by self
    /// @param _timelockExpire New timelock time
    function setTimelockExpire(uint256 _timelockExpire) public onlyThisContract {
        timelockExpire = _timelockExpire;
        emit TimelockExpireUpdated(timelockExpire);
    }

    /**
     * Public functions
     */

    /// @dev Initiate change
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    function initiateChange(bytes memory _data, address _changeAddress) public onlyOwner {
        require(getCurrentChangeState(_data, _changeAddress) == ChangeState.Uninitialized, "T: Change not able to be initiated");
        changes[_data][_changeAddress].unlockTime = timelock + block.timestamp;
        changes[_data][_changeAddress].unlockExpireTime = changes[_data][_changeAddress].unlockTime + timelockExpire;

        emit ChangeInitiated(_data, _changeAddress, block.timestamp);
    }

    /// @dev Execute change
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    function executeChange(bytes memory _data, address _changeAddress) public payable onlyOwner {
        require(getCurrentChangeState(_data, _changeAddress) == ChangeState.Changeable, "T: Change not able to be made");
        delete changes[_data][_changeAddress];
        _changeAddress.call.value(msg.value)(_data);
        emit ChangeExecuted(_data, _changeAddress, block.timestamp);
    }

    /// @dev Cancel change
    /// @param _data Data that will be cancelled
    /// @param _changeAddress Address that will receive the data
    function cancelChange(bytes memory _data, address _changeAddress) public onlyOwner {
        delete changes[_data][_changeAddress];
        emit ChangeCancelled(_data, _changeAddress, block.timestamp);
    }
}
