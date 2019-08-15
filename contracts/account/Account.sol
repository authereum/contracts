pragma solidity ^0.5.8;

import "../interfaces/IERC1271.sol";
import "openzeppelin-solidity/contracts/cryptography/ECDSA.sol";
import "openzeppelin-solidity/contracts/math/SafeMath.sol";
import "zos-lib/contracts/Initializable.sol";
import "solidity-bytes-utils/contracts/BytesLib.sol";

contract Account is Initializable, IERC1271 {
    using SafeMath for uint256;
    using ECDSA for bytes32;
    using BytesLib for bytes;

    address[] public authKeysArray;
    mapping(address => uint256) public authKeysArrayIndex;
    mapping(address => bool) public authKeys;
    uint256 public nonce;
    uint256 public CHAIN_ID;

    // bytes4(keccak256("isValidSignature(bytes,bytes)")
    bytes4 constant internal VALID_SIG = 0x20c13b0b;
    bytes4 constant internal INVALID_SIG = 0xffffffff;

    event FundsReceived(address indexed sender, uint256 indexed value);
    event AddedAuthKey(address indexed authKey);
    event RemovedAuthKey(address indexed authKey);
    event SwappedAuthKeys(address indexed oldAuthKey, address indexed newAuthKey);

    // Invalid Sigs
    event InvalidAuthkey();
    event InvalidTransactionDataSigner();
    // Invalid Firewalls
    event OverDailyLimit();
    // Invalid Tx
    event CallFailed(bytes32 encodedData);

    modifier onlyValidAuthKeyOrSelf {
        _validateAuthKey(msg.sender);
        _;
    }

    function initialize() public initializer {
        CHAIN_ID = 1;
    }

    function () external payable {
        emit FundsReceived(msg.sender, msg.value);
    }

    /**
     *  Getters
     */

    /// @dev Return the length of the authKeysArray
    function getAuthKeysArrayLength() public view returns (uint256) {
        return authKeysArray.length;
    }

    /// @dev Get the current nonce of the contract
    function getNonce() public view returns (uint256) {
        return nonce;
    }

    /**
     *  Public functions
     */

    /// @dev Execute a transaction
    /// @notice This is to be called directly by an AuthKey
    /// @param _destination Destination of the transaction
    /// @param _value Value of the transaction
    /// @param _data Data of the transaction
    /// @param _gasLimit Gas limit of the transaction
    function executeTransaction(
        address _destination,
        uint256 _value,
        bytes memory _data,
        uint256 _gasLimit
    )
        public
        onlyValidAuthKeyOrSelf
        returns (bytes memory)
    {
        return _executeTransaction(_destination, _value, _data, _gasLimit);
    }

    /// @dev Add an auth key to the list of auth keys
    /// @param _authKey Address of the auth key to add
    function addAuthKey(address _authKey) public onlyValidAuthKeyOrSelf {
        require(!authKeys[_authKey], "Auth key already added");
        authKeys[_authKey] = true;
        authKeysArray.push(_authKey);
        authKeysArrayIndex[_authKey] = authKeysArray.length - 1;
        emit AddedAuthKey(_authKey);
    }

    /// @dev Add multiple auth keys to the list of auth keys
    /// @param _authKeys Array of addresses to add to the auth keys list
    function addMultipleAuthKeys(address[] memory _authKeys) public onlyValidAuthKeyOrSelf {
        for (uint256 i = 0; i < _authKeys.length; i++) {
            addAuthKey(_authKeys[i]);
        }
    }

    /// @dev Remove an auth key from the list of auth keys
    /// @param _authKey Address of the auth key to remove
    function removeAuthKey(address _authKey) public onlyValidAuthKeyOrSelf {
        require(authKeys[_authKey], "Auth key not yet added");
        require(getAuthKeysArrayLength() > 1, "Cannot remove last auth key");
        authKeys[_authKey] = false;
        _removeAuthKeyFromArray(_authKey);
        authKeysArrayIndex[_authKey] = 0;
        emit RemovedAuthKey(_authKey);
    }

    /// @dev Remove multiple auth keys to the list of auth keys
    /// @param _authKeys Array of addresses to remove to the auth keys list
    function removeMultipleAuthKeys(address[] memory _authKeys) public onlyValidAuthKeyOrSelf {
        for (uint256 i = 0; i < _authKeys.length; i++) {
            removeAuthKey(_authKeys[i]);
        }
    }

    /// @dev Swap one authKey for a non-authKey
    /// @param _oldAuthKey An existing authKey
    /// @param _newAuthKey A non-existing authKey
    function swapAuthKeys(
        address _oldAuthKey,
        address _newAuthKey
    )
        public
        onlyValidAuthKeyOrSelf
    {
        require(authKeys[_oldAuthKey], "Old auth key does not exist");
        require(!authKeys[_newAuthKey], "New auth key already exists");
        addAuthKey(_newAuthKey);
        removeAuthKey(_oldAuthKey);
        emit SwappedAuthKeys(_oldAuthKey, _newAuthKey);
    }

    /// @dev Swap multiple auth keys to the list of auth keys
    /// @param _oldAuthKeys Array of addresses to remove to the auth keys list
    /// @param _newAuthKeys Array of addresses to add to the auth keys list
    function swapMultipleAuthKeys(
        address[] memory _oldAuthKeys,
        address[] memory _newAuthKeys
    )
        public
    {
        require(_oldAuthKeys.length == _newAuthKeys.length, "Input arrays not equal length");
        for (uint256 i = 0; i < _oldAuthKeys.length; i++) {
            swapAuthKeys(_oldAuthKeys[i], _newAuthKeys[i]);
        }
    }

    function isValidSignature(
        bytes memory _msg,
        bytes memory _signatures
    )
        public
        view
        returns (bytes4)
    {
        if (_signatures.length == 65) {
            return isValidAuthKeySignature(_msg, _signatures);
        } else if (_signatures.length == 130) {
            return isValidLoginKeySignature(_msg, _signatures);
        } else {
            revert("Invalid _signatures length");
        }
    }

    function isValidAuthKeySignature(
        bytes memory _msg,
        bytes memory _signature
    )
        public
        view
        returns (bytes4)
    {
        address authKeyAddress = getEthSignedMessageHash(_msg).recover(
            _signature
        );

        if(authKeys[authKeyAddress]) {
            return VALID_SIG;
        } else {
            return INVALID_SIG;
        }
    }

    function isValidLoginKeySignature(
        bytes memory _msg,
        bytes memory _signatures
    )
        public
        view
        returns (bytes4)
    {
        bytes memory msgHashSignature = _signatures.slice(0, 65);
        bytes memory loginKeyAuthorizationSignature = _signatures.slice(65, 65);

        address loginKeyAddress = getEthSignedMessageHash(_msg).recover(
            msgHashSignature
        );

        bytes32 loginKeyAuthorizationMessageHash = keccak256(abi.encodePacked(
            loginKeyAddress
        )).toEthSignedMessageHash();

        address authorizationSigner = loginKeyAuthorizationMessageHash.recover(
            loginKeyAuthorizationSignature
        );

        if(authKeys[authorizationSigner]) {
            return VALID_SIG;
        } else {
            return INVALID_SIG;
        }
    }

    /**
     *  Internal functions
     */

    /// Remove an authKey from the authKeys array
    /// @param _authKey authKey to remove
    function _removeAuthKeyFromArray(address _authKey) internal {
        uint256 index = authKeysArrayIndex[_authKey];

        for (uint256 i = index; i < authKeysArray.length - 1; i++) {
            authKeysArray[i] = authKeysArray[i + 1];
        }

        delete authKeysArray[authKeysArray.length - 1];
        authKeysArray.length--;
    }

    /// @dev Validate an authKey
    /// @param _authKey Address of the auth key to validate
    function _validateAuthKey(address _authKey) internal view {
        require(authKeys[_authKey] == true || msg.sender == address(this), "Auth key is invalid");
    }

    /// @dev Validate signatures from an AuthKeyMetaTx
    /// @param _txDataMessageHash Ethereum signed message of the transaction
    /// @param _transactionDataSignature Signed tx data
    function _validateAuthKeyMetaTxSigs(
        bytes32 _txDataMessageHash,
        bytes memory _transactionDataSignature
    )
        internal
        view
        returns (address)
    {
        address transactionDataSigner = _txDataMessageHash.recover(_transactionDataSignature);
        _validateAuthKey(transactionDataSigner);
        return transactionDataSigner;
    }

    /// @dev Validate signatures from an AuthKeyMetaTx
    /// @param _txDataMessageHash Ethereum signed message of the transaction
    /// @param _transactionDataSignature Signed tx data
    /// @param _loginKeyAuthorizationSignature Signed loginKey
    function validateLoginKeyMetaTxSigs(
        bytes32 _txDataMessageHash,
        bytes memory _transactionDataSignature,
        bytes memory _loginKeyAuthorizationSignature
    )
        public
        view
        returns (address)
    {
        address transactionDataSigner = _txDataMessageHash.recover(
            _transactionDataSignature
        );

        bytes32 loginKeyAuthorizationMessageHash = keccak256(abi.encodePacked(
            transactionDataSigner
        )).toEthSignedMessageHash();

        address authorizationSigner = loginKeyAuthorizationMessageHash.recover(
            _loginKeyAuthorizationSignature
        );
        _validateAuthKey(authorizationSigner);

        return transactionDataSigner;
    }

    /// @dev Execute a transaction without a refund
    /// @notice This is the transaction sent from the CBA
    /// @param _destination Destination of the transaction
    /// @param _value Value of the transaction
    /// @param _data Data of the transaction
    /// @param _gasLimit Gas limit of the transaction
    function _executeTransaction(
        address _destination,
        uint256 _value,
        bytes memory _data,
        uint256 _gasLimit
    )
        internal
        returns (bytes memory)
    {
        (bool success, bytes memory response) = _destination.call.gas(_gasLimit).value(_value)(_data);

        if (!success) {
            bytes32 encodedData = _encodeData(nonce, _destination, _value, _data);
            emit CallFailed(encodedData);
        }

        // Increment nonce here so that both relayed and non-relayed calls will increment nonce
        // Must be incremented after !success data encode in order to encode original nonce
        nonce++;

        return response;
    }

    /// @dev Execute a transaction with a refund
    /// @notice This is meant to be used by executeAuthKeyMetaTx when being called
    /// @notice from a relayer.
    /// @param _destination Destination of the transaction
    /// @param _value Value of the transaction
    /// @param _data Data of the transaction
    /// @param _gasPrice Gas price of the transaction
    /// @param _gasLimit Gas limit of the transaction
    /// @param _startGas Starting gas at the beginning of the transaction
    function _executeTransactionWithRefund(
        address _destination,
        uint256 _value,
        bytes memory _data,
        uint256 _gasPrice,
        uint256 _gasLimit,
        uint256 _startGas
    )
        internal
        returns (bytes memory)
    {
        bytes memory response = _executeTransaction(_destination, _value, _data, _gasLimit);
        _issueRefund(_startGas, _gasPrice);
        return response;
    }

    /// @dev Issue a refund
    /// @param _gasPrice Gas price to use when sending a refund
    function _issueRefund(
        uint256 _startGas,
        uint256 _gasPrice
    )
        internal
    {
        uint256 _gasUsed = _startGas.sub(gasleft());
        require(_gasUsed.mul(_gasPrice) <= address(this).balance, "Insufficient gas for refund");
        msg.sender.transfer(_gasUsed.mul(_gasPrice));
    }

    /// @dev Encode data for a failed transaction
    /// @param _nonce Nonce of the transaction
    /// @param _destination Destination of the transaction
    /// @param _value Value of the transaction
    /// @param _data Data of the transaction
    function _encodeData(
        uint256 _nonce,
        address _destination,
        uint256 _value,
        bytes memory _data
    )
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(
            _nonce,
            _destination,
            _value,
            _data
        ));
    }

    /// @dev Adds ETH signed message prefix to bytes message and hashes it
    /// @param _msg the bytes message before adding the prefix
    /// @return the prefixed and hashed message
    function getEthSignedMessageHash(bytes memory _msg) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n", uint2str(_msg.length), _msg));
    }

    /// @dev Convert uint to string
    /// @param _num uint to be converted
    /// @return the string equivalent of the uint
    function uint2str(uint _num) private pure returns (string memory _uintAsString) {
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