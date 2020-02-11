pragma solidity 0.5.16;

contract IERC20 {
    function balanceOf(address account) external returns (uint256);
    function transfer(address recipient, uint256 amount) external returns (bool);
}
