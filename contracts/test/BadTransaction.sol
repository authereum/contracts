pragma solidity 0.5.16;

/**
 * @title Authereum Proxy Factory
 * @author Authereum, Inc.
 * @dev A contract that has a transaction that will throw.
 */

contract BadTransaction {
    function () external payable {
        require(1 == 2, "BT: Will fail");
    }
}
