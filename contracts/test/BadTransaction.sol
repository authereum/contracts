pragma solidity 0.5.16;

/**
 * @title Authereum Bad Transaction
 * @author Authereum Labs, Inc.
 * @dev A contract that has a transaction that will throw.
 */

contract BadTransaction {
    function () external payable {
        require(1 == 2, "BT: Will fail");
    }
}
