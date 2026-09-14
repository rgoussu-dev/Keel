package com.example.application.api;

import com.example.greeting.userside.api.contract.ProblemDetails;
import io.quarkus.test.junit.QuarkusTest;
import org.junit.jupiter.api.Test;
import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.equalTo;

/**
 * The injected specification. It dispatches through the real
 * container, so it is red until the handler is one the container
 * actually finds — not merely one that compiles.
 */
@QuarkusTest
class FarewellResourceTest {
    @Test
    void takesLeaveByNameThroughMediator() {
        given()
            .queryParam("name", "Romain")
            .when()
            .get("/farewell")
            .then()
            .statusCode(200)
            .body("farewell", equalTo("Goodbye, Romain!"));
    }

    @Test
    void defaultsToWorldWhenNoNameIsGiven() {
        given().when().get("/farewell").then().statusCode(200).body("farewell", equalTo("Goodbye, world!"));
    }

    @Test
    void mapsFarewellRejectedToProblemDetails() {
        given()
            .queryParam("name", "  ")
            .when()
            .get("/farewell")
            .then()
            .statusCode(400)
            .contentType(ProblemDetails.PROBLEM_JSON)
            .body("status", equalTo(400))
            .body("detail", equalTo("name must not be blank"));
    }
}
