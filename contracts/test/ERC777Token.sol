pragma solidity 0.5.17;

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";

contract ERC777Token is ERC777 {
// contract ERC777Token {
    constructor() public ERC777("Test", "TST", new address[](0)) {
    // constructor() public {

    }

    function mint(address _to, uint256 _amount) external {
        // address operator,
        // address account,
        // uint256 amount,
        // bytes memory userData,
        // bytes memory operatorData
        bytes memory zeroByres = new bytes(0);
        _mint(msg.sender, _to, _amount, zeroByres, zeroByres);
    }
}