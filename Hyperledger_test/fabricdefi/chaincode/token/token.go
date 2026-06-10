package main

import (
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// TokenContract provides functions for managing a token
type TokenContract struct {
	contractapi.Contract
}

// Account represents a user account
type Account struct {
	ID      string `json:"id"`
	Balance int    `json:"balance"`
}

const balancePrefix = "account~name"

// InitLedger adds a base set of accounts to the ledger
func (s *TokenContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	accounts := []Account{
		{ID: "BankA_User", Balance: 1000},
		{ID: "BankB_User", Balance: 1000},
		{ID: "Regulator", Balance: 1000},
	}

	for _, acc := range accounts {
		err := s.updateBalance(ctx, acc.ID, acc.Balance)
		if err != nil {
			return err
		}
	}
	return nil
}

// Issue creates new tokens and adds them to the account balance. Only Regulator can do this.
// For simplicity, we just allow anyone to call it, but verify caller ID in a real scenario.
func (s *TokenContract) Issue(ctx contractapi.TransactionContextInterface, accountID string, amountStr string) error {
	amount, err := strconv.Atoi(amountStr)
	if err != nil {
		return fmt.Errorf("amount must be an integer")
	}
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}

	currentBalance, err := s.BalanceOf(ctx, accountID)
	if err != nil {
		// Account might not exist yet, treat balance as 0
		currentBalance = 0
	}

	return s.updateBalance(ctx, accountID, currentBalance+amount)
}

// BalanceOf returns the balance of the given account
func (s *TokenContract) BalanceOf(ctx contractapi.TransactionContextInterface, accountID string) (int, error) {
	compositeKey, err := ctx.GetStub().CreateCompositeKey(balancePrefix, []string{accountID})
	if err != nil {
		return 0, fmt.Errorf("failed to create composite key: %v", err)
	}

	balanceBytes, err := ctx.GetStub().GetState(compositeKey)
	if err != nil {
		return 0, fmt.Errorf("failed to read from world state: %v", err)
	}
	if balanceBytes == nil {
		return 0, fmt.Errorf("the account %s does not exist", accountID)
	}

	var account Account
	err = json.Unmarshal(balanceBytes, &account)
	if err != nil {
		return 0, err
	}

	return account.Balance, nil
}

// Transfer transfers tokens from one account to another (Invoked by transfer chaincode or directly)
func (s *TokenContract) Transfer(ctx contractapi.TransactionContextInterface, from string, to string, amountStr string) error {
	amount, err := strconv.Atoi(amountStr)
	if err != nil {
		return fmt.Errorf("amount must be an integer")
	}
	if amount <= 0 {
		return fmt.Errorf("amount must be positive")
	}

	fromBalance, err := s.BalanceOf(ctx, from)
	if err != nil {
		return err
	}
	if fromBalance < amount {
		return fmt.Errorf("insufficient funds in account %s", from)
	}

	toBalance, err := s.BalanceOf(ctx, to)
	if err != nil {
		toBalance = 0
	}

	err = s.updateBalance(ctx, from, fromBalance-amount)
	if err != nil {
		return err
	}

	err = s.updateBalance(ctx, to, toBalance+amount)
	if err != nil {
		return err
	}

	return nil
}

// Internal function to update balance
func (s *TokenContract) updateBalance(ctx contractapi.TransactionContextInterface, accountID string, balance int) error {
	account := Account{
		ID:      accountID,
		Balance: balance,
	}
	accountBytes, err := json.Marshal(account)
	if err != nil {
		return err
	}

	compositeKey, err := ctx.GetStub().CreateCompositeKey(balancePrefix, []string{accountID})
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(compositeKey, accountBytes)
}

func main() {
	chaincode, err := contractapi.NewChaincode(&TokenContract{})
	if err != nil {
		fmt.Printf("Error create token chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting token chaincode: %s", err.Error())
	}
}
