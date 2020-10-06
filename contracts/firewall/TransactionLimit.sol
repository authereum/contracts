pragma solidity 0.5.17;
pragma experimental ABIEncoderV2;

import "../account/BaseAccount.sol";

/**
 * @title TransactionLimit
 * @author Authereum Labs, Inc.
 * @dev Used to limit login key's transaction limits. This contract handles all
 * @dev functionality related to daily limits for login keys.
 */

contract TransactionLimit is BaseAccount {

    uint256 constant defaultDailyLimit = 10 ether;


    // NOTE: This state and events will be included in the state and event
    // NOTE: account files if they are ever included in an upgrade
    uint256 public dailyLimit;
    mapping(uint256 => uint256) public dailyLimitTracker;

    event DailySpendIncreased(uint256 indexed day, uint256 indexed spendIncrease);
    event DailyLimitChanged(address indexed authKey, uint256 indexed newDailyLimit);


    /**
     * Getters
     */

    /// @dev Gets the current day for the contract
    /// @return Current day
    function getCurrentDay() public view returns (uint256) {
        return block.timestamp / 86400;
    }

    /// @dev Check if a user is within their daily limit
    /// @return True if transaction will be within the daily limit
    function getIsWithinEthDailyTransactionLimit() public view returns (bool) {
        return getWillBeWithinEthDailyTransactionLimit(0);
    }

    /// @dev Check if a user will be within their daily limit after a transaction
    /// @param _value Value being sent with the current transaction
    /// @return True if transaction will be within the daily limit
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
    /// @param _newDailyLimit New daily limit to set
    function changeDailyLimit(uint256 _newDailyLimit) public onlyAuthKeyOrSelf {
        dailyLimit = _newDailyLimit;
        emit DailyLimitChanged(msg.sender, dailyLimit);
    }

    /**
     * Internal functions
     */

    /// @dev Update the tracked balance for daily limit for a user
    /// @param _value Value being sent with the current transaction
    function updateEthDailyTransactionLimit(uint256 _value) internal {
        // Do not update anything if there is no value associated with the transaction
        if (_value == 0) return;

        dailyLimitTracker[getCurrentDay()] += _value;
        emit DailySpendIncreased(getCurrentDay(), _value);
    }
}