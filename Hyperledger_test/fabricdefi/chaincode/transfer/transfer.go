package main

import (
	"fmt"
	"time"
	"encoding/json"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// TransferContract provides functions for transferring tokens
type TransferContract struct {
	contractapi.Contract
}

// TransferRecord stores transfer history
type TransferRecord struct {
	TxID      string    `json:"txId"`
	From      string    `json:"from"`
	To        string    `json:"to"`
	Amount    string    `json:"amount"`
	Timestamp time.Time `json:"timestamp"`
}

// Transfer performs a P2P transfer by invoking the token chaincode
func (s *TransferContract) Transfer(ctx contractapi.TransactionContextInterface, from string, to string, amount string) error {
	// Call token chaincode to perform transfer
	// InvokeChaincode(chaincodeName, args, channel)
	response := ctx.GetStub().InvokeChaincode("token", [][]byte{[]byte("Transfer"), []byte(from), []byte(to), []byte(amount)}, "")
	
	if response.Status != 200 {
		return fmt.Errorf("failed to transfer tokens: %s", response.Message)
	}

	// Save record for history
	txTime, _ := ctx.GetStub().GetTxTimestamp()
	record := TransferRecord{
		TxID:      ctx.GetStub().GetTxID(),
		From:      from,
		To:        to,
		Amount:    amount,
		Timestamp: time.Unix(txTime.Seconds, int64(txTime.Nanos)),
	}

	recordBytes, err := json.Marshal(record)
	if err != nil {
		return err
	}

	// Composite key for querying history by account
	historyKey, err := ctx.GetStub().CreateCompositeKey("history~account~txid", []string{from, ctx.GetStub().GetTxID()})
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(historyKey, recordBytes)
}

// GetHistory returns the transfer history for an account
func (s *TransferContract) GetHistory(ctx contractapi.TransactionContextInterface, account string) ([]*TransferRecord, error) {
	resultsIterator, err := ctx.GetStub().GetStateByPartialCompositeKey("history~account~txid", []string{account})
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var records []*TransferRecord
	for resultsIterator.HasNext() {
		responseRange, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}

		var record TransferRecord
		err = json.Unmarshal(responseRange.Value, &record)
		if err != nil {
			return nil, err
		}
		records = append(records, &record)
	}

	return records, nil
}

func main() {
	chaincode, err := contractapi.NewChaincode(&TransferContract{})
	if err != nil {
		fmt.Printf("Error create transfer chaincode: %s", err.Error())
		return
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting transfer chaincode: %s", err.Error())
	}
}
