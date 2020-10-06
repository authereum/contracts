pragma solidity 0.5.17;

import "../state/AccountState.sol";
import "../../interfaces/IERC1820Registry.sol";

/**
 * @title AccountInitializeV3
 * @author Authereum Labs, Inc.
 * @dev This contract holds the initialize function used by the account contracts.
 * @dev This abstraction exists in order to retain the order of the initialization functions.
 */

contract AccountInitializeV3 is AccountState {

    address constant private ERC1820_REGISTRY_ADDRESS = 0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24;
    bytes32 constant private TOKENS_RECIPIENT_INTERFACE_HASH = 0xb281fc8c12954d22544db45de3159a39272895b169a852b314f9cc762e44c53b;

    /// @dev Initialize the Authereum Account with the 1820 registry
    function initializeV3() public {
        require(lastInitializedVersion == 2, "AI3: Improper initialization order");
        lastInitializedVersion = 3;

        IERC1820Registry registry = IERC1820Registry(ERC1820_REGISTRY_ADDRESS);
        registry.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));
    }
}
