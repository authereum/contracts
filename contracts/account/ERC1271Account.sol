pragma solidity 0.5.16;

import "./BaseAccount.sol";
import "../interfaces/IERC1271.sol";

/**
 * @title ERC1271Account
 * @author Authereum Labs, Inc.
 * @dev Implements isValidSignature for ERC1271 compatibility
 */

contract ERC1271Account is IERC1271, BaseAccount {

    // NOTE: Valid magic value bytes4(keccak256("isValidSignature(bytes,bytes)")
    bytes4 constant private VALID_SIG = 0x20c13b0b;
    // NOTE: Invalid magic value
    bytes4 constant private INVALID_SIG = 0xffffffff;

    /**
     *  Public functions
     */

    /// @dev Check if a message and signature pair is valid
    /// @notice The _signature parameter can either be one auth key signature or it can
    /// @notice be a login key signature and an auth key signature (signed login key)
    /// @param _data Data that was signed
    /// @param _signature Signature(s) of the data. Either a single signature (login) or two (login and auth)
    /// @return VALID_SIG or INVALID_SIG hex data
    function isValidSignature(
        bytes memory _data,
        bytes memory _signature
    )
        public
        view
        returns (bytes4)
    {
        if (_signature.length == 65) {
            return isValidAuthKeySignature(_data, _signature);
        } else if (_signature.length >= 130) {
            return isValidLoginKeySignature(_data, _signature);
        } else {
            revert("ERC1271: Invalid isValidSignature _signature length");
        }
    }

    /// @dev Check if a message and auth key signature pair is valid
    /// @param _data Data that was signed
    /// @param _signature Signature of the data signed by the authkey
    /// @return VALID_SIG or INVALID_SIG hex data
    function isValidAuthKeySignature(
        bytes memory _data,
        bytes memory _signature
    )
        public
        view
        returns (bytes4)
    {
        require(_signature.length == 65, "ERC1271: Invalid isValidAuthKeySignature _signature length");

        address authKeyAddress = _getEthSignedMessageHash(_data).recover(
            _signature
        );

        bytes4 magicValue = _isValidAuthKey(authKeyAddress) ? VALID_SIG : INVALID_SIG;
        return magicValue;
    }

    /// @dev Check if a message and login key signature pair is valid, as well as a signed login key by an auth key
    /// @param _data Message that was signed
    /// @param _signature Signature of the data. Signed msg data by the login key and signed login key by auth key
    /// @return VALID_SIG or INVALID_SIG hex data
    function isValidLoginKeySignature(
        bytes memory _data,
        bytes memory _signature
    )
        public
        view
        returns (bytes4)
    {
        require(_signature.length >= 130, "ERC1271: Invalid isValidLoginKeySignature _signature length");

        bytes memory msgHashSignature = _signature.slice(0, 65);
        bytes memory loginKeyAttestationSignature = _signature.slice(65, 65);
        uint256 restrictionDataLength = _signature.length.sub(130);
        bytes memory loginKeyRestrictionData = _signature.slice(130, restrictionDataLength);

        address _loginKeyAddress = _getEthSignedMessageHash(_data).recover(
            msgHashSignature
        );

        // NOTE: The OpenZeppelin toEthSignedMessageHash is used here (and not above)
        // NOTE: because the length is hard coded at 32 and we know that this will always
        // NOTE: be true for this line.
        bytes32 loginKeyAttestationMessageHash = keccak256(abi.encode(
            _loginKeyAddress, loginKeyRestrictionData
        )).toEthSignedMessageHash();

        address _authKeyAddress = loginKeyAttestationMessageHash.recover(
            loginKeyAttestationSignature
        );

        bytes4 magicValue = _isValidAuthKey(_authKeyAddress) ? VALID_SIG : INVALID_SIG;
        return magicValue;
    }

    /**
     *  Internal functions
     */

    /// @dev Adds ETH signed message prefix to bytes message and hashes it
    /// @param _data Bytes data before adding the prefix
    /// @return Prefixed and hashed message
    function _getEthSignedMessageHash(bytes memory _data) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n", _uint2str(_data.length), _data));
    }

    /// @dev Convert uint to string
    /// @param _num Uint to be converted
    /// @return String equivalent of the uint
    function _uint2str(uint _num) private pure returns (string memory _uintAsString) {
        if (_num == 0) {
            return "0";
        }
        uint i = _num;
        uint j = _num;
        uint len;
        while (j != 0) {
            len++;
            j /= 10;
        }
        bytes memory bstr = new bytes(len);
        uint k = len - 1;
        while (i != 0) {
            bstr[k--] = byte(uint8(48 + i % 10));
            i /= 10;
        }
        return string(bstr);
    }
}