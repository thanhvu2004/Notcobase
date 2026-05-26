namespace notcobase.Services.Seeding;

public static class MetadataSeedData
{
    public sealed record ComponentSeed(
        string ComponentName,
        string Category,
        string DefaultPropsJson,
        string DefaultSchemaJson,
        string Icon,
        bool CanHaveChildren);

    public sealed record BlockTemplateSeed(string Name, string Type, string SchemaJson);

    public sealed record StarterPageSeed(string Name, string Slug, string SchemaJson, bool IsPublished);

    public static IReadOnlyList<ComponentSeed> ComponentDefinitions { get; } = new[]
    {
        Component("Input", "Fields", "form-outlined", canHaveChildren: false,
            defaultProps: """{"placeholder":"Enter value"}""",
            defaultSchema: """
            {"type":"string","title":"Input","x-component":"Input","x-index":0}
            """),
        Component("Select", "Fields", "select-outlined", canHaveChildren: false,
            defaultProps: """{"placeholder":"Select value","allowClear":true}""",
            defaultSchema: """
            {"type":"string","title":"Select","x-component":"Select","enum":[{"label":"Option A","value":"a"},{"label":"Option B","value":"b"}],"x-index":0}
            """),
        Component("Card", "Layout", "credit-card-outlined", canHaveChildren: true,
            defaultProps: """{"title":"Card","bordered":true}""",
            defaultSchema: """
            {"type":"void","title":"Card","x-component":"Card","x-component-props":{"title":"Card"},"properties":{},"x-index":0}
            """),
        Component("Table", "Data", "table-outlined", canHaveChildren: false,
            defaultProps: """{"size":"middle","pagination":{"pageSize":10}}""",
            defaultSchema: """
            {"type":"array","title":"Table","x-component":"Table","x-component-props":{"columns":[{"title":"Name","dataIndex":"name"},{"title":"Status","dataIndex":"status"}],"dataSource":[]},"x-index":0}
            """),
        Component("Tabs", "Layout", "appstore-outlined", canHaveChildren: true,
            defaultProps: """{}""",
            defaultSchema: """
            {"type":"void","title":"Tabs","x-component":"Tabs","properties":{"tab1":{"type":"void","title":"Tab 1","x-component":"Card","properties":{}}},"x-index":0}
            """),
        Component("Row", "Layout", "column-width-outlined", canHaveChildren: true,
            defaultProps: """{"gutter":16}""",
            defaultSchema: """
            {"type":"void","title":"Row","x-component":"Grid.Row","x-component-props":{"gutter":16},"properties":{"col1":{"type":"void","x-component":"Grid.Col","x-component-props":{"span":12},"properties":{}}},"x-index":0}
            """),
        Component("Col", "Layout", "column-height-outlined", canHaveChildren: true,
            defaultProps: """{"span":12}""",
            defaultSchema: """
            {"type":"void","title":"Column","x-component":"Grid.Col","x-component-props":{"span":12},"properties":{},"x-index":0}
            """),
        Component("Space", "Layout", "column-width-outlined", canHaveChildren: true,
            defaultProps: """{"size":"middle"}""",
            defaultSchema: """
            {"type":"void","title":"Space","x-component":"Space","properties":{},"x-index":0}
            """),
        Component("Button", "Actions", "button-outlined", canHaveChildren: false,
            defaultProps: """{"type":"default"}""",
            defaultSchema: """
            {"type":"void","title":"Button","x-component":"Button","x-component-props":{"type":"primary"},"x-index":0}
            """),
        Component("DetailCard", "Data", "profile-outlined", canHaveChildren: true,
            defaultProps: """{"title":"Record details","bordered":true}""",
            defaultSchema: """
            {"type":"void","title":"Detail card","x-component":"Card","x-component-props":{"title":"Record details"},"properties":{"name":{"type":"string","title":"Name","x-component":"Input","x-index":0},"status":{"type":"string","title":"Status","x-component":"Select","x-index":1}},"x-index":0}
            """),
        Component("FormBlock", "Layout", "form-outlined", canHaveChildren: true,
            defaultProps: """{"layout":"vertical"}""",
            defaultSchema: """
            {"type":"object","title":"Form block","x-component":"Form","x-component-props":{"layout":"vertical"},"properties":{"name":{"type":"string","title":"Name","x-component":"Input","x-index":0}},"x-index":0}
            """),
        Component("TableBlock", "Data", "table-outlined", canHaveChildren: false,
            defaultProps: """{"size":"middle","pagination":{"pageSize":10}}""",
            defaultSchema: """
            {"type":"array","title":"Table block","x-component":"Table","x-component-props":{"columns":[{"title":"Name","dataIndex":"name"},{"title":"Created","dataIndex":"createdAt"}],"dataSource":[]},"x-index":0}
            """),
    };

    public static IReadOnlyList<BlockTemplateSeed> BlockTemplates { get; } = new BlockTemplateSeed[]
    {
        new BlockTemplateSeed("Empty form block", "block", """
        {"type":"object","name":"formBlock","title":"Form block","x-component":"Form","x-component-props":{"layout":"vertical"},"properties":{"name":{"type":"string","title":"Name","x-component":"Input","x-index":0},"submit":{"type":"void","title":"Submit","x-component":"Button","x-component-props":{"type":"primary","htmlType":"submit"},"x-index":1}}}
        """.Trim()),
        new BlockTemplateSeed("Record table block", "block", """
        {"type":"array","name":"tableBlock","title":"Records","x-component":"Table","x-component-props":{"columns":[{"title":"Name","dataIndex":"name"},{"title":"Status","dataIndex":"status"}],"dataSource":[]}}
        """.Trim()),
        new BlockTemplateSeed("Detail card block", "block", """
        {"type":"void","name":"detailCardBlock","title":"Record details","x-component":"Card","x-component-props":{"title":"Record details"},"properties":{"name":{"type":"string","title":"Name","x-component":"Input","x-index":0},"email":{"type":"string","title":"Email","x-component":"Input","x-index":1}}}
        """.Trim()),
    };

    public static IReadOnlyList<BlockTemplateSeed> LayoutTemplates { get; } = new BlockTemplateSeed[]
    {
        new BlockTemplateSeed("Single column page", "layout", """
        {"type":"object","name":"singleColumnLayout","title":"Page","properties":{"content":{"type":"void","title":"Content","x-component":"Card","properties":{}}}}
        """.Trim()),
        new BlockTemplateSeed("Two column page", "layout", """
        {"type":"object","name":"twoColumnLayout","title":"Page","properties":{"main":{"type":"void","title":"Main","x-component":"Grid.Row","x-component-props":{"gutter":16},"properties":{"left":{"type":"void","x-component":"Grid.Col","x-component-props":{"span":16},"properties":{}},"right":{"type":"void","x-component":"Grid.Col","x-component-props":{"span":8},"properties":{}}}}}}
        """.Trim()),
        new BlockTemplateSeed("Tabs layout", "layout", """
        {"type":"object","name":"tabsLayout","title":"Page","properties":{"tabs":{"type":"void","title":"Tabs","x-component":"Tabs","properties":{"overview":{"type":"void","title":"Overview","x-component":"Card","properties":{}},"details":{"type":"void","title":"Details","x-component":"Card","properties":{}}}}}}
        """.Trim()),
    };

    public static IReadOnlyList<StarterPageSeed> StarterPages { get; } = new StarterPageSeed[]
    {
        new StarterPageSeed(
            "Customer form",
            "customer-form",
            """
            {"type":"object","name":"customerForm","title":"Customer form","x-component":"Form","x-component-props":{"layout":"vertical"},"required":["name"],"properties":{"name":{"type":"string","title":"Customer name","x-component":"Input","x-index":0},"status":{"type":"string","title":"Status","x-component":"Select","enum":[{"label":"Lead","value":"lead"},{"label":"Active","value":"active"}],"x-index":1},"actions":{"type":"void","x-component":"Space","x-index":2,"properties":{"submit":{"type":"void","title":"Submit","x-component":"Button","x-component-props":{"type":"primary","htmlType":"submit"},"x-index":0}}}}}
            """.Trim(),
            IsPublished: true),
        new StarterPageSeed(
            "Records list",
            "records-list",
            """
            {"type":"object","name":"recordsListPage","title":"Records","properties":{"table":{"type":"array","title":"Records","x-component":"Table","x-component-props":{"columns":[{"title":"Name","dataIndex":"name"},{"title":"Status","dataIndex":"status"}],"dataSource":[]},"x-index":0}}}
            """.Trim(),
            IsPublished: true),
    };

    private static ComponentSeed Component(
        string componentName,
        string category,
        string icon,
        bool canHaveChildren,
        string defaultProps,
        string defaultSchema) =>
        new(componentName, category, defaultProps, defaultSchema.Trim(), icon, canHaveChildren);
}
