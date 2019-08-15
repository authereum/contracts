pragma solidity ^0.5.8;

/**
 * A contract that has a transaction that will throw.
 */
contract BadTransaction {
    function () external payable {
        require(1 == 2, "Will fail");
    }
}
