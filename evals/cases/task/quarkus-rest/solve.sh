#!/usr/bin/env bash
# Reference solution proving the case solvable: the command and its
# domain error in the contract face, the handler behind the
# @DomainHandler marker the container discovers by, the transport DTO
# and the resource — one module per ring, exactly as the layout map
# describes them.
set -euo pipefail
ctx=modules/greeting
pkg=com/example/greeting

mkdir -p "$ctx/domain/contract/src/main/java/$pkg/domain/contract/farewell"
cat > "$ctx/domain/contract/src/main/java/$pkg/domain/contract/farewell/FarewellCommand.java" <<'JAVA'
package com.example.greeting.domain.contract.farewell;

import com.example.platform.kernel.Command;

/**
 * Take leave of someone by name.
 */
public record FarewellCommand(String name) implements Command<String> {}
JAVA
cat > "$ctx/domain/contract/src/main/java/$pkg/domain/contract/farewell/FarewellRejected.java" <<'JAVA'
package com.example.greeting.domain.contract.farewell;

/**
 * Raised when a {@link FarewellCommand} carries a blank name.
 */
public final class FarewellRejected extends RuntimeException {
    public FarewellRejected(String message) {
        super(message);
    }
}
JAVA

mkdir -p "$ctx/domain/core/src/main/java/$pkg/domain/core/farewell"
cat > "$ctx/domain/core/src/main/java/$pkg/domain/core/farewell/FarewellHandler.java" <<'JAVA'
package com.example.greeting.domain.core.farewell;

import com.example.platform.kernel.DomainHandler;
import com.example.greeting.domain.contract.farewell.FarewellCommand;
import com.example.greeting.domain.contract.farewell.FarewellRejected;
import com.example.platform.kernel.Command;
import com.example.platform.kernel.Handler;

@DomainHandler
public final class FarewellHandler implements Handler<FarewellCommand, String> {
    @Override
    public boolean supports(Command<?> command) {
        return command instanceof FarewellCommand;
    }

    @Override
    public String handle(FarewellCommand command) {
        String name = command.name() == null ? "" : command.name().trim();
        if (name.isEmpty()) {
            throw new FarewellRejected("name must not be blank");
        }
        return "Goodbye, " + name + "!";
    }
}
JAVA

cat > "$ctx/user-side/api/contract/src/main/java/$pkg/userside/api/contract/FarewellResponse.java" <<'JAVA'
package com.example.greeting.userside.api.contract;

/**
 * Transport shape of a successful {@code GET /farewell} call.
 */
public record FarewellResponse(String farewell) {}
JAVA

cat > "$ctx/user-side/api/adapters/src/main/java/$pkg/userside/api/FarewellResource.java" <<'JAVA'
package com.example.greeting.userside.api;

import jakarta.inject.Inject;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.MediaType;
import com.example.greeting.domain.contract.farewell.FarewellCommand;
import com.example.greeting.userside.api.contract.FarewellResponse;
import com.example.platform.kernel.Mediator;

/**
 * HTTP entry point for the farewell use case. No business logic.
 */
@Path("/farewell")
public class FarewellResource {
    private final Mediator mediator;

    @Inject
    public FarewellResource(Mediator mediator) {
        this.mediator = mediator;
    }

    @GET
    @Produces(MediaType.APPLICATION_JSON)
    public FarewellResponse farewell(@QueryParam("name") @DefaultValue("world") String name) {
        return new FarewellResponse(mediator.dispatch(new FarewellCommand(name)));
    }
}
JAVA

cat > "$ctx/user-side/api/adapters/src/main/java/$pkg/userside/api/FarewellRejectedMapper.java" <<'JAVA'
package com.example.greeting.userside.api;

import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import jakarta.ws.rs.ext.ExceptionMapper;
import jakarta.ws.rs.ext.Provider;
import com.example.greeting.domain.contract.farewell.FarewellRejected;
import com.example.greeting.userside.api.contract.ProblemDetails;

/**
 * Maps the domain's {@link FarewellRejected} to RFC 9457 Problem
 * Details.
 */
@Provider
public class FarewellRejectedMapper implements ExceptionMapper<FarewellRejected> {
    @Context
    UriInfo uriInfo;

    @Override
    public Response toResponse(FarewellRejected rejected) {
        ProblemDetails body = new ProblemDetails(
                "urn:problem-type:farewell-rejected",
                "Farewell rejected",
                400,
                rejected.getMessage(),
                uriInfo.getRequestUri().getPath()
        );
        return Response.status(400).type(ProblemDetails.PROBLEM_JSON).entity(body).build();
    }
}
JAVA
