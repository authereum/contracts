pragma solidity 0.5.17;

/**
 * @title Authereum Return Transaction
 * @author Authereum Labs, Inc.
 * @dev A contract that has a transaction that will return 123.
 */

contract ReturnTransaction {
    event UintEvent(uint256 _data);
    event UintEvent2(uint256 num1, uint256 num2);

    function returnTest() external payable returns (uint256) {
        emit UintEvent(123);
        return 123;
    }

    function returnTest2(uint256 num1, uint256 num2) external payable returns (uint256) {
        emit UintEvent2(num1, num2);
        return num1;
    }
}
