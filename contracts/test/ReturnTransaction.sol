pragma solidity 0.5.16;

/**
 * @title Authereum Return Transaction
 * @author Authereum Labs, Inc.
 * @dev A contract that has a transaction that will return 123.
 */

contract ReturnTransaction {
    event UintEvent(uint256 _data);

    function returnTest() external payable returns (uint256) {
        emit UintEvent(123);
        return 123;
    }
}
