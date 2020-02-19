pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "../base/Owned.sol";

/**
 * @title AuthereumEnsResolverProxy
 * @author Authereum Labs, Inc.
 * @dev The Authereum ENS Resolver Proxy.
 */

contract AuthereumEnsResolverProxy is Owned {
    string constant public authereumEnsResolverProxyVersion = "2019111500";

    /// @dev Storage slot with the address of the current implementation.
    /// @notice This is the keccak-256 hash of "eip1967.proxy.implementation" subtracted 
    /// @notice by 1, and is validated in the constructor.
    bytes32 internal constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /// @dev Set the implementation address in the constructor
    /// @param _logic Address of the logic contract
    constructor(address _logic) public payable {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, _logic)
        }
    }

    /**
     * Fallback
     */

    /// @dev Fallback function
    /// @notice A payable fallback needs to be implemented in the implementation contract
    /// @notice This is a low level function that doesn't return to its internal call site.
    /// @notice It will return to the external caller whatever the implementation returns.
    function () external payable {
        if (msg.data.length == 0) return;
        address _implementation = implementation();

        assembly {
            // Copy msg.data. We take full control of memory in this inline assembly
            // block because it will not return to Solidity code. We overwrite the
            // Solidity scratch pad at memory position 0.
            calldatacopy(0, 0, calldatasize)

            // Call the implementation.
            // out and outsize are 0 because we don't know the size yet.
            let result := delegatecall(gas, _implementation, 0, calldatasize, 0, 0)

            // Copy the returned data.
            returndatacopy(0, 0, returndatasize)

            switch result
            // delegatecall returns 0 on error.
            case 0 { revert(0, returndatasize) }
            default { return(0, returndatasize) }
        }
    }

    /**
     * Setters
     */

    /// @dev Set the implementation address
    /// @param _logic Address of the logic contract
    function setImplementation (address _logic) public onlyOwner {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            sstore(slot, _logic)
        }
    }

    /**
     * Getters
     */

    /// @dev Returns the current implementation.
    /// @return Address of the current implementation
    function implementation() public view returns (address impl) {
        bytes32 slot = IMPLEMENTATION_SLOT;
        assembly {
            impl := sload(slot)
        }
    }
}