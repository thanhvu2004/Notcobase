using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace notcobase.Pages
{
    ///[Authorize]
    public class UsersModel : PageModel
    {
        public string JwtToken { get; set; } = string.Empty;

        public IActionResult OnGet()
        {
            // Check if user is authenticated via session
            var token = HttpContext.Session.GetString("JwtToken");
            if (string.IsNullOrEmpty(token))
            {
                return RedirectToPage("/Login");
            }

            JwtToken = token;
            return Page();
        }
    }
}
