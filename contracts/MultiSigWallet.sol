// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title Multi-Signature Wallet
/// @notice A wallet that requires multiple owner confirmations to execute a transaction.
/// @dev Owners and confirmation threshold are set at deployment time.
contract MultiSigWallet {
    /* ============================================================
                                STATE
       ============================================================ */

    address[] public owners;
    mapping(address => bool) public isOwner;

    uint256 public numConfirmationsRequired;

    struct Transaction {
        address to;
        uint256 value;
        bytes data;
        bool executed;
        uint256 numConfirmations;
    }

    // List of all transactions ever submitted
    Transaction[] public transactions;

    // txIndex => owner => confirmed?
    mapping(uint256 => mapping(address => bool)) public isConfirmed;

    /* ============================================================
                                EVENTS
       ============================================================ */

    event Deposit(address indexed sender, uint256 amount, uint256 balance);
    event SubmitTransaction(
        address indexed owner,
        uint256 indexed txIndex,
        address indexed to,
        uint256 value,
        bytes data
    );
    event ConfirmTransaction(address indexed owner, uint256 indexed txIndex);
    event RevokeConfirmation(address indexed owner, uint256 indexed txIndex);
    event ExecuteTransaction(address indexed owner, uint256 indexed txIndex);

    /* ============================================================
                                MODIFIERS
       ============================================================ */

    modifier onlyOwner() {
        require(isOwner[msg.sender], "Not an owner");
        _;
    }

    modifier txExists(uint256 _txIndex) {
        require(_txIndex < transactions.length, "Transaction does not exist");
        _;
    }

    modifier notExecuted(uint256 _txIndex) {
        require(!transactions[_txIndex].executed, "Transaction already executed");
        _;
    }

    modifier notConfirmed(uint256 _txIndex) {
        require(!isConfirmed[_txIndex][msg.sender], "Transaction already confirmed");
        _;
    }

    /* ============================================================
                                CONSTRUCTOR
       ============================================================ */

    constructor(address[] memory _owners, uint256 _numConfirmationsRequired) {
        require(_owners.length > 0, "Owners required");
        require(
            _numConfirmationsRequired > 0 &&
            _numConfirmationsRequired <= _owners.length,
            "Invalid confirmation threshold"
        );

        for (uint256 i = 0; i < _owners.length; i++) {
            address owner = _owners[i];

            require(owner != address(0), "Invalid owner");
            require(!isOwner[owner], "Owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
    }

    /* ============================================================
                        RECEIVE (ACCEPT ETHER)
       ============================================================ */

    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }

    /* ============================================================
                        MAIN WALLET FUNCTIONS
       ============================================================ */

    /// @notice Submit a new transaction for approval by the owners.
    /// @param _to Target address to call.
    /// @param _value Amount of Ether (in wei) to send.
    /// @param _data Calldata for the target (can be empty for plain ETH transfer).
    function submitTransaction(
        address _to,
        uint256 _value,
        bytes memory _data
    ) external onlyOwner {
        require(_to != address(0), "Invalid target address");

        uint256 txIndex = transactions.length;

        transactions.push(
            Transaction({
                to: _to,
                value: _value,
                data: _data,
                executed: false,
                numConfirmations: 0
            })
        );

        emit SubmitTransaction(msg.sender, txIndex, _to, _value, _data);
    }

    /// @notice Confirm a previously submitted transaction.
    /// @param _txIndex Index of the transaction in the transactions array.
    function confirmTransaction(
        uint256 _txIndex
    )
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
        notConfirmed(_txIndex)
    {
        isConfirmed[_txIndex][msg.sender] = true;
        transactions[_txIndex].numConfirmations += 1;

        emit ConfirmTransaction(msg.sender, _txIndex);
    }

    /// @notice Revoke a previously given confirmation for a transaction.
    /// @param _txIndex Index of the transaction in the transactions array.
    function revokeConfirmation(
        uint256 _txIndex
    )
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        require(
            isConfirmed[_txIndex][msg.sender],
            "Transaction not confirmed by caller"
        );

        isConfirmed[_txIndex][msg.sender] = false;
        transactions[_txIndex].numConfirmations -= 1;

        emit RevokeConfirmation(msg.sender, _txIndex);
    }

    /// @notice Execute a confirmed transaction if it has enough approvals.
    /// @param _txIndex Index of the transaction in the transactions array.
    function executeTransaction(
        uint256 _txIndex
    )
        external
        onlyOwner
        txExists(_txIndex)
        notExecuted(_txIndex)
    {
        Transaction storage transaction = transactions[_txIndex];

        require(
            transaction.numConfirmations >= numConfirmationsRequired,
            "Not enough confirmations"
        );

        // Checks-effects-interactions pattern:
        transaction.executed = true;

        (bool success, ) = transaction.to.call{value: transaction.value}(
            transaction.data
        );
        require(success, "Transaction failed");

        emit ExecuteTransaction(msg.sender, _txIndex);
    }

    /* ============================================================
                            VIEW / HELPER FUNCTIONS
       ============================================================ */

    /// @notice Returns the list of owners.
    function getOwners() external view returns (address[] memory) {
        return owners;
    }

    /// @notice Returns the total number of transactions submitted.
    function getTransactionCount() external view returns (uint256) {
        return transactions.length;
    }

    /// @notice Returns detailed information about a transaction.
    function getTransaction(
        uint256 _txIndex
    )
        external
        view
        returns (
            address to,
            uint256 value,
            bytes memory data,
            bool executed,
            uint256 numConfirmations
        )
    {
        Transaction storage transaction = transactions[_txIndex];
        return (
            transaction.to,
            transaction.value,
            transaction.data,
            transaction.executed,
            transaction.numConfirmations
        );
    }
}
