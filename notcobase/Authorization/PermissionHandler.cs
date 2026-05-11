using Microsoft.AspNetCore.Authorization;

namespace notcobase.Authorization
{
    public class PermissionHandler
        : AuthorizationHandler<PermissionRequirement>
    {
        protected override Task HandleRequirementAsync(
            AuthorizationHandlerContext context,
            PermissionRequirement requirement)
        {
            foreach (var claim in context.User.Claims)
            {
                Console.WriteLine($"{claim.Type}: {claim.Value}");
            }
            var hasPermission = context.User.HasClaim(
                "permission",
                requirement.Permission);

            if (hasPermission)
            {
                context.Succeed(requirement);
            }

            return Task.CompletedTask;
        }
    }
}