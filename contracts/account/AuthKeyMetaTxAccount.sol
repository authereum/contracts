pragma solidity ^0.5.8;

import "./Account.sol";

contract AuthKeyMetaTxAccount is Account {

    /// @dev Execute an authKey meta transaction
    /// @param _destination Destination of the transaction
    /// @param _data Data of the transaction
    /// @param _value Value of the transaction
    /// @param _gasLimit Gas limit of the transaction
    /// @param _transactionDataSignature Signed tx data
    function executeAuthKeyMetaTx(
        address _destination,
        bytes memory _data,
        uint256 _value,
        uint256 _gasLimit,
        bytes memory _transactionDataSignature
    )
        public
        returns (bytes memory)
    {
        uint256 startGas = gasleft();

        bytes32 _txDataMessageHash = keccak256(abi.encodePacked(
            address(this),
            msg.sig,
            CHAIN_ID,
            _destination,
            _data,
            _value,
            nonce,
            tx.gasprice,
            _gasLimit
        )).toEthSignedMessageHash();

        address transactionDataSigner = _validateAuthKeyMetaTxSigs(
            _txDataMessageHash, _transactionDataSignature
        );

        bytes memory response = _executeTransactionWithRefund(
            _destination, _value, _data, tx.gasprice, _gasLimit, startGas
        );

        return response;
    }
}