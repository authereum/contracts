pragma solidity ^0.5.8;

import "../account/Account.sol";

contract TransactionLimit is Account {

    uint256 public dailyLimit;
    mapping(uint256 => uint256) public dailyLimitTracker;

    event DailyLimitChanged(address indexed authKey, uint256 indexed newDailyLimit);

    function initialize() public initializer {
        dailyLimit = 10 ether;
    }

    /**
     * Getters
     */

    /// @dev Gets the current day for the contract
    function getCurrentDay() public view returns (uint256) {
        return block.timestamp / 86400;
    }

    /// @dev Check if a user is within their daily limit
    function getIsWithinEthDailyTransactionLimit() public view returns (bool) {
        return getWillBeWithinEthDailyTransactionLimit(0);
    }

    /// @dev Check if a user will be within their daily limit after a transaction
    /// @param _value Value being sent with the current transaction
    function getWillBeWithinEthDailyTransactionLimit(uint256 _value) public view returns (bool) {
        uint256 currentDay = getCurrentDay();
        uint256 dailySpend = dailyLimitTracker[currentDay] + _value;
        if (dailySpend <= dailyLimit) {
            return true;
        }
        return false;
    }

    /**
     * Setters
     */

    /// @dev Change the daily limit for a user
    /// @dev _newDailyLimit New daily limit to set
    function changeDailyLimit(uint256 _newDailyLimit) public onlyValidAuthKeyOrSelf {
        dailyLimit = _newDailyLimit;
        emit DailyLimitChanged(msg.sender, dailyLimit);
    }

    /**
     * Internal functions
     */

    /// @dev Check the daily limit for a user and update the balance
    /// @param _value Value being sent with the current transaction
    function checkAndUpdateEthDailyTransactionLimit(uint256 _value) internal returns (bool) {
        bool _isWithinDailyLimit = getWillBeWithinEthDailyTransactionLimit(_value);
        if (_isWithinDailyLimit) {
            dailyLimitTracker[getCurrentDay()] += _value;
            return true;
        }
        return false;
    }
}