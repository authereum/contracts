pragma solidity 0.5.16;

import '../utils/Address.sol';
import './BaseAccount.sol';

/**
 * @title AccountUpgradeability
 * @author Authereum Labs, Inc.
 * @dev The upgradeability logic for an Authereum account.
 */

contract AccountUpgradeability is BaseAccount {
    /// @dev Storage slot with the address of the current implementation
    /// @notice This is the keccak-256 hash of "eip1967.proxy.implementation" subtracted 
    /// @notice by 1, and is validated in the constructor
    bytes32 internal constant IMPLEMENTATION_SLOT = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;

    /**
     *  Public functions
     */

    /// @dev Upgrades the proxy to the newest implementation of a contract and 
    /// @dev forwards a function call to it
    /// @notice This is useful to initialize the proxied contract
    /// @param _newImplementation Address of the new implementation
    /// @param _data Array of initialize data
    function upgradeToAndCall(
        address _newImplementation, 
        bytes memory _data
    ) 
        public 
        onlySelf
    {
        _setImplementation(_newImplementation);
        (bool success, bytes memory res) = _newImplementation.delegatecall(_data);

        // Get the revert message of the call and revert with it if the call failed
        string memory _revertMsg = _getRevertMsg(res);
        require(success, _revertMsg);
        emit Upgraded(_newImplementation);
    }

    /**
     *  Internal functions
     */

    /// @dev Sets the implementation address of the proxy
    /// @notice This is only meant to be called when upgrading self
    /// @notice The initial setImplementation for a proxy is set during
    /// @notice the proxy's initialization, not with this call
    /// @param _newImplementation Address of the new implementation
    function _setImplementation(address _newImplementation) internal {
        require(OpenZeppelinUpgradesAddress.isContract(_newImplementation), "AU: Cannot set a proxy implementation to a non-contract address");

        bytes32 slot = IMPLEMENTATION_SLOT;

        assembly {
            sstore(slot, _newImplementation)
        }
    }
}