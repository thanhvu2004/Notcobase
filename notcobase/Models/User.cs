namespace notcobase.Models

{
	public class User
	{
		public int Id { get; set; }
		public required string Username { get; set; }
		public required string PasswordHashed { get; set; }
		public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public ICollection<UserRole>? UserRoles { get; set; }
    }
}

