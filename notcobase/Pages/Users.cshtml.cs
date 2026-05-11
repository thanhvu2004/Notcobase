using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace notcobase.Pages
{
    public class UsersModel : PageModel
    {
        public IActionResult OnGet()
        {
            return Page();
        }
    }
}