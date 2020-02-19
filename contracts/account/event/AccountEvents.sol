
pragma solidity 0.5.16;

/**
 * @title AccountEvents
 * @author Authereum Labs, Inc.
 * @dev This contract holds the events used by the Authereum contracts.
 * @dev This abstraction exists in order to retain the order to give initialization functions
 * @dev access to events.
 * @dev This contract can be overwritten with no changes to the upgradeability.
 */

contract AccountEvents {

    /**
     * BaseAccount.sol
     */

    event AuthKeyAdded(address indexed authKey);
    event AuthKeyRemoved(address indexed authKey);
    event CallFailed(string reason);

    /**
     * AccountUpgradeability.sol
     */

    event Upgraded(address indexed implementation);
}