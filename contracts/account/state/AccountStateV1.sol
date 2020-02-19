pragma solidity 0.5.16;

/**
 * @title AccountStateV1
 * @author Authereum Labs, Inc.
 * @dev This contract holds the state variables used by the account contracts.
 * @dev This abstraction exists in order to retain the order of the state variables.
 */

contract AccountStateV1 {
    uint256 public lastInitializedVersion;
    mapping(address => bool) public authKeys;
    uint256 public nonce;
    uint256 public numAuthKeys;
}