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
            {"type":"string","title":"Select","x-component":"Select","x-index":0}
            """),
        Component("Card", "Layout", "credit-card-outlined", canHaveChildren: true,
            defaultProps: """{"title":"Card","bordered":true}""",
            defaultSchema: """
            {"type":"void","title":"Card","x-component":"Card","x-component-props":{"title":"Card"},"properties":{},"x-index":0}
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
            defaultProps: """{"title":"Record details","bordered":true,"tableId":null,"recordIdParam":"id","allowEdit":true,"allowDelete":true,"layout":"vertical"}""",
            defaultSchema: """
            {"type":"void","title":"Detail card","x-component":"DetailCard","x-component-props":{"title":"Record details","bordered":true,"tableId":null,"recordIdParam":"id","allowEdit":true,"allowDelete":true,"layout":"vertical"},"properties":{"name":{"type":"string","title":"Name","x-component":"Input","x-field":"name","x-index":0},"status":{"type":"string","title":"Status","x-component":"Select","x-field":"status","x-index":1}},"x-index":0}
            """),
        Component("FormBlock", "Layout", "form-outlined", canHaveChildren: true,
            defaultProps: """{"title":"Form block","layout":"vertical","tableId":null,"recordIdParam":"id","mode":"auto","allowCreate":true,"allowDelete":false,"submitLabel":"Save"}""",
            defaultSchema: """
            {"type":"object","title":"Form block","x-component":"FormBlock","x-component-props":{"title":"Form block","layout":"vertical","tableId":null,"recordIdParam":"id","mode":"auto","allowCreate":true,"allowDelete":false,"submitLabel":"Save"},"properties":{"name":{"type":"string","title":"Name","x-component":"Input","x-field":"name","x-index":0}},"x-index":0}
            """),
        Component("TableBlock", "Data", "table-outlined", canHaveChildren: false,
            defaultProps: """{"title":"Records","tableId":null,"allowCreate":true,"allowEdit":true,"allowDelete":true,"pageSize":10,"columns":[]}""",
            defaultSchema: """
            {"type":"array","title":"Table block","x-component":"TableBlock","x-component-props":{"title":"Records","tableId":null,"allowCreate":true,"allowEdit":true,"allowDelete":true,"pageSize":10,"columns":[]},"x-index":0}
            """),
    };

    public static IReadOnlyList<BlockTemplateSeed> BlockTemplates { get; } = new BlockTemplateSeed[]
    {
        new BlockTemplateSeed("Empty form block", "block", """
        {"type":"object","name":"formBlock","title":"Form block","x-component":"FormBlock","x-component-props":{"title":"Form block","layout":"vertical","tableId":null,"recordIdParam":"id","mode":"auto","allowCreate":true,"allowDelete":false,"submitLabel":"Save"},"properties":{"name":{"type":"string","title":"Name","x-component":"Input","x-field":"name","x-index":0},"submit":{"type":"void","title":"Submit","x-component":"Button","x-component-props":{"type":"primary","htmlType":"submit"},"x-index":1}}}
        """.Trim()),
        new BlockTemplateSeed("Record table block", "block", """
        {"type":"array","name":"tableBlock","title":"Records","x-component":"TableBlock","x-component-props":{"title":"Records","tableId":null,"allowCreate":true,"allowEdit":true,"allowDelete":true,"pageSize":10,"columns":[]}}
        """.Trim()),
        new BlockTemplateSeed("Detail card block", "block", """
        {"type":"void","name":"detailCardBlock","title":"Record details","x-component":"DetailCard","x-component-props":{"title":"Record details","bordered":true,"tableId":null,"recordIdParam":"id","allowEdit":true,"allowDelete":true,"layout":"vertical"},"properties":{"name":{"type":"string","title":"Name","x-component":"Input","x-field":"name","x-index":0},"email":{"type":"string","title":"Email","x-component":"Input","x-field":"email","x-index":1}}}
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

    private static ComponentSeed Component(
        string componentName,
        string category,
        string icon,
        bool canHaveChildren,
        string defaultProps,
        string defaultSchema) =>
        new(componentName, category, defaultProps, defaultSchema.Trim(), icon, canHaveChildren);
}
