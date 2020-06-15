pragma solidity 0.5.16;
pragma experimental ABIEncoderV2;

import "../modules/AuthereumDelegateKeyModule.sol";

/**
 * @title Parse Call Data
 * @author Authereum Labs, Inc.
 * @dev Inherits AuthereumDelegateKeyModule in order to test the _parseCalldata() function.
 * @dev The purpose of this file is to test the private function from the real contract.
 */

contract ParseCallData is AuthereumDelegateKeyModule {

    /// @dev Calls the internal _parseCalldata function
    /// @dev This is used strictly for testing purposes
    /// @param _data The calldata of the transaction made by the Authereum account
    /// @param _parameterCount Number parameters in the function call
    /// @return The function selector of the parsed data
    /// @return The parameters of the parsed data
    function callParseCalldata(
        bytes memory _data,
        uint256 _parameterCount
    )
        public
        pure
        returns (bytes4, bytes32[] memory)
    {
        return _parseCalldata(_data, _parameterCount);
    }
}
