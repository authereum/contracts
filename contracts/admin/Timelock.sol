pragma solidity ^0.5.8;

import "../base/Owned.sol";

/**
 * @title Timelock
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
        ChangeState changeState;
    }

    event UpdateTimelock(uint256 indexed newTimelock);
    event UpdateTimelockExpire(uint256 indexed newTimelockExpire);
    event StateUpdate(bytes data, address indexed changeAddress, uint256 changeTime, ChangeState state);

    mapping(bytes => mapping(address => ContractChangeTime)) public changes;

    modifier onlyThisContract {
        require(msg.sender == address(this), "Only this contract can call this function");
        _;
    }

    /// @param _timelock Amount of time that a pending change is locked for
    /// @param _timelockExpire Amoutn of time AFTER timelock that data is changeable before expiring
    constructor(uint256 _timelock, uint256 _timelockExpire) public {
        timelock = _timelock;
        timelockExpire = _timelockExpire;
        emit UpdateTimelock(timelock);
        emit UpdateTimelockExpire(timelockExpire);
    }

    /**
     * Getters
     */

    /// @dev Get unlock time of change
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    function getUnlockTime(bytes memory _data, address _changeAddress) public view returns (uint256) {
        return changes[_data][_changeAddress].unlockTime;
    }

    /// @dev Get the expiration time of change
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    function getUnlockExpireTime(bytes memory _data, address _changeAddress) public view returns (uint256) {
        return changes[_data][_changeAddress].unlockExpireTime;
    }

    /// @dev Get remaining time until change can be made
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
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
    function getCurrentChangeState(bytes memory _data, address _changeAddress) public view returns (ChangeState) {
        return changes[_data][_changeAddress].changeState;
    }

    /**
     * Setters
     */

    /// @dev Sets a new timelock.
    /// @notice Can only be called by self.
    /// @param _timelock New timelock time
    function setTimelock(uint256 _timelock) public onlyThisContract {
        timelock = _timelock;
        emit UpdateTimelock(timelock);
    }

    /// @dev Sets a new timelock exipration.
    /// @notice Can only be called by self.
    /// @param _timelockExpire New timelock time
    function setTimelockExpire(uint256 _timelockExpire) public onlyThisContract {
        timelockExpire = _timelockExpire;
        emit UpdateTimelockExpire(timelockExpire);
    }

    /// @dev Set the state of some data
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    function setCurrentChangeState(bytes memory _data, address _changeAddress) public {
        uint256 unlockTime = changes[_data][_changeAddress].unlockTime;
        uint256 unlockExpireTime = changes[_data][_changeAddress].unlockExpireTime;
        if (unlockTime == 0) {
            changes[_data][_changeAddress].changeState = ChangeState.Uninitialized;
        } else if (unlockTime != 0 && block.timestamp < unlockTime) {
            changes[_data][_changeAddress].changeState = ChangeState.Pending;
        } else if (unlockTime != 0 && unlockTime <= block.timestamp && block.timestamp < unlockExpireTime) {
            changes[_data][_changeAddress].changeState = ChangeState.Changeable;
        } else if (unlockTime != 0 && unlockExpireTime <= block.timestamp) {
            changes[_data][_changeAddress].changeState = ChangeState.Expired;
        }
        emit StateUpdate(_data, _changeAddress, block.timestamp, changes[_data][_changeAddress].changeState);
    }

    /**
     * Public functions
     */

    /// @dev Initiate change
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    function initiateChange(bytes memory _data, address _changeAddress) public onlyOwner {
        setCurrentChangeState(_data, _changeAddress);
        require(uint256(changes[_data][_changeAddress].changeState) == 0, "Change not able to be initiated");
        changes[_data][_changeAddress].changeState = ChangeState.Pending;
        changes[_data][_changeAddress].unlockTime = timelock + block.timestamp;
        changes[_data][_changeAddress].unlockExpireTime = changes[_data][_changeAddress].unlockTime + timelockExpire;

        emit StateUpdate(_data, _changeAddress, block.timestamp, changes[_data][_changeAddress].changeState);
    }

    /// @dev Make change
    /// @param _data Data that will be the change
    /// @param _changeAddress Address that will receive the data
    function makeChange(bytes memory _data, address _changeAddress) public payable onlyOwner {
        setCurrentChangeState(_data, _changeAddress);
        require(uint256(changes[_data][_changeAddress].changeState) == 2, "Change not able to be made");
        delete changes[_data][_changeAddress];
        _changeAddress.call.value(msg.value)(_data);
        emit StateUpdate(_data, _changeAddress, block.timestamp, changes[_data][_changeAddress].changeState);
    }

    /// @dev Cancel change
    /// @param _data Data that will be cancelled
    /// @param _changeAddress Address that will receive the data
    function cancelChange(bytes memory _data, address _changeAddress) public onlyOwner {
        delete changes[_data][_changeAddress];
        emit StateUpdate(_data, _changeAddress, block.timestamp, changes[_data][_changeAddress].changeState);
    }
}
