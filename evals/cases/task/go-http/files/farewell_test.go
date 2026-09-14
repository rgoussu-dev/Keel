// The injected specification: a farewell endpoint, reached through
// the context's own driving port and its real core — no fake here, so
// the composed message is part of what is asserted.
package resthttp_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"example.com/task-eval/internal/modules/greeting"
	"example.com/task-eval/internal/modules/greeting/userside/resthttp"
)

type farewellBody struct {
	Farewell string `json:"farewell"`
}

func farewellServer(t *testing.T) *httptest.Server {
	t.Helper()
	server := httptest.NewServer(resthttp.NewHandler(greeting.NewGreeter()))
	t.Cleanup(server.Close)
	return server
}

func TestFarewellComposesTheMessageForTheNamedAddressee(t *testing.T) {
	res, err := http.Get(farewellServer(t).URL + "/farewell?name=Ada")
	if err != nil {
		t.Fatalf("GET /farewell failed: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusOK)
	}
	var body farewellBody
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decoding the response failed: %v", err)
	}
	if want := "Goodbye, Ada!"; body.Farewell != want {
		t.Fatalf("farewell = %q, want %q", body.Farewell, want)
	}
}

func TestFarewellDefaultsAnAbsentNameToWorld(t *testing.T) {
	res, err := http.Get(farewellServer(t).URL + "/farewell")
	if err != nil {
		t.Fatalf("GET /farewell failed: %v", err)
	}
	defer res.Body.Close()

	var body farewellBody
	if err := json.NewDecoder(res.Body).Decode(&body); err != nil {
		t.Fatalf("decoding the response failed: %v", err)
	}
	if want := "Goodbye, world!"; body.Farewell != want {
		t.Fatalf("farewell = %q, want %q", body.Farewell, want)
	}
}

func TestFarewellRejectsABlankNameAsAProblemDocument(t *testing.T) {
	res, err := http.Get(farewellServer(t).URL + "/farewell?name=%20%20")
	if err != nil {
		t.Fatalf("GET /farewell failed: %v", err)
	}
	defer res.Body.Close()

	if res.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", res.StatusCode, http.StatusBadRequest)
	}
	if got := res.Header.Get("Content-Type"); got != "application/problem+json" {
		t.Fatalf("content type = %q, want %q", got, "application/problem+json")
	}
}
