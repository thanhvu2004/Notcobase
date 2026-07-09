# Huong Dan RAG Cho Agent Ho Tro Notcobase

Muc dich: tai lieu nay la nguon tri thuc cho chat agent ho tro nguoi dung da dang nhap su dung Notcobase. Agent nen tra loi cac cau hoi thuc te nhu "lam the nao de..." ve bang du lieu, ban ghi, nguoi dung, quyen, vai tro, trang va trinh chinh sua giao dien truc quan.

Doi tuong: nguoi dung cuoi va quan tri vien su dung giao dien web Notcobase.

Tom tat san pham: Notcobase la nen tang low-code de xay dung ung dung noi bo. Nguoi dung co the tao bang du lieu, them truong va ban ghi, quan ly truy cap bang nguoi dung/vai tro/quyen, va tao trang tuy chinh bang Page Builder truc quan. Page Builder co the hien thi form, bang, thanh phan bo cuc, nut dieu huong va cac truong du lieu.

## Cach Agent Nen Tra Loi

Khi tra loi nguoi dung:

- Dua cac buoc thao tac ngan gon tren UI truoc.
- Neu mot tinh nang co the bi an, hay noi ro quyen can co.
- Su dung dung thuat ngu Notcobase: bang, truong, ban ghi, trang, editor mode, vai tro, quyen, FormBlock, TableBlock.
- Neu nguoi dung khong thay mot hanh dong, hay kiem tra thieu quyen hoac chua bat Editor mode truoc.
- Khong tu tao tinh nang. Neu tinh nang khong duoc mo ta trong tai lieu nay, hay noi rang tinh nang do co the chua co trong ban hien tai.
- Voi cac hanh dong nguy hiem nhu xoa bang, truong, ban ghi, nguoi dung, vai tro, quyen hoac trang, hay nhac rang Notcobase se yeu cau xac nhan va hanh dong co the anh huong den du lieu hoac quyen truy cap.

## Dieu Huong Chinh

Sau khi dang nhap, thanh dieu huong tren cung co cac khu vuc mac dinh va cac trang tuy chinh.

- Tables mo trinh tao bang va quan ly ban ghi.
- Menu nguoi dung/he thong co the mo Users and Permissions khi nguoi dung dang nhap co mot trong cac quyen `users.view`, `roles.view`, hoac `permissions.view`.
- Cac trang low-code tuy chinh xuat hien tren thanh dieu huong khi trang da duoc published, duoc hien trong navbar, va nguoi dung hien tai co quyen ma trang yeu cau.
- Nguoi dung co `pages.editor` co the bat/tat Editor mode o header.
- Trong Editor mode, nguoi dung co the them trang hoac section bang nut cong tren thanh dieu huong, sap xep trang/section bang keo tha, va chinh sua trang dang chon.

Neu khong co trang tuy chinh nao kha dung va Editor mode dang tat, ung dung se hien trang trong.

## Tai Khoan Admin Mac Dinh

Backend seeder tao vai tro `Administrator` voi tat ca quyen mac dinh va tao nguoi dung `admin` voi mat khau `admin123` neu nguoi dung nay chua ton tai.

Huong dan ho tro: hay nhac quan tri vien doi mat khau mac dinh trong moi truong that va khong chia se tai khoan quan tri.

## Tham Chieu Quyen

Quyen la cac chuoi ten duoc luu trong vai tro va duoc dua vao token cua nguoi dung dang nhap.

Quyen nguoi dung va vai tro:

- `users.view`, `users.create`, `users.edit`, `users.delete`
- `roles.view`, `roles.create`, `roles.edit`, `roles.delete`
- `roles.assign`, `roles.remove`
- `permissions.view`, `permissions.create`, `permissions.edit`, `permissions.delete`
- `permissions.assign`, `permissions.remove`

Quyen trang:

- `pages.view` cho phep nguoi dung xem cac ban ghi trang low-code.
- `pages.editor` cho phep nguoi dung tao, chinh sua, luu, xoa va sap xep cac trang low-code. Nguoi dung co `pages.editor` cung co the tai danh sach quyen de cau hinh truy cap trang.

Quyen bang, truong va ban ghi:

- `tables.view`, `tables.create`, `tables.edit`, `tables.delete`
- `columns.view`, `columns.create`, `columns.edit`, `columns.delete`
- `records.view`, `records.create`, `records.edit`, `records.delete`

Xu ly loi quyen thuong gap:

- Neu bi chan o Tables, nguoi dung can `tables.view`.
- Neu khong thay nut tao bang, nguoi dung can `tables.create`.
- Neu khong thay form them/sua truong, nguoi dung can `columns.create` hoac `columns.edit`.
- Neu khong thay Add Record, nguoi dung can `records.create`.
- Neu khong thay Editor mode, nguoi dung can `pages.editor`.
- Neu mot trang tuy chinh bi an, hay kiem tra `showInNavbar`, `requiredPermission`, va nguoi dung co quyen do hay khong.
- Neu khu vuc Users bi chan, nguoi dung can it nhat mot trong `users.view`, `roles.view`, hoac `permissions.view`.

## Bang: Tao Va Quan Ly Bang

Bang la mo hinh du lieu do nguoi dung dinh nghia. Bang chua cac truong, va ban ghi luu gia tri cho cac truong do.

De tao bang:

1. Mo Tables.
2. Chon Create Table.
3. Nhap ten bang.
4. Tuy chon nhap mo ta.
5. Tuy chon bat "inherit properties from another table" va chon bang cha.
6. Luu.

De sua bang:

1. Mo Tables.
2. Chon bang trong danh sach.
3. Chon Edit Table.
4. Doi ten, mo ta, hoac cau hinh ke thua.
5. Luu.

De xoa bang:

1. Mo Tables.
2. Chon bang.
3. Chon Delete.
4. Xac nhan thong bao.

Hanh vi ke thua quan trong:

- Mot bang co the ke thua truong tu bang cha.
- Truong ke thua duoc hien trong bang con nhung khong the sap xep lai, sua, hoac xoa tu bang con.
- Khong the xoa bang cha khi van co bang khac ke thua tu no.

## Truong: Kieu Va Cau Hinh

Truong la cot trong bang. Cac kieu truong duoc ho tro:

- `text`: o nhap van ban ngan.
- `longtext`: van ban nhieu dong.
- `url`: o nhap URL.
- `number`: o nhap so.
- `finance`: o nhap so voi buoc thap phan.
- `date`: o nhap ngay.
- `checkbox`: gia tri dung/sai.
- `select`: danh sach lua chon.
- `reference`: lien ket den ban ghi trong bang khac.
- `file`: luu ten tep tu thao tac chon tep.

De them truong:

1. Mo Tables.
2. Chon mot bang.
3. Dung form Add Field.
4. Nhap ten truong.
5. Chon kieu truong.
6. Danh dau Required neu ban ghi bat buoc phai co gia tri.
7. Cau hinh cac thiet lap rieng cua kieu truong neu co.
8. Chon Save Field.

De sua truong:

1. Mo Tables.
2. Chon mot bang.
3. Trong danh sach truong, chon Edit tren truong can sua.
4. Cap nhat thiet lap.
5. Chon Save Field.

De sap xep truong:

1. Mo Tables.
2. Chon mot bang.
3. Keo mot truong khong phai truong ke thua den vi tri moi trong danh sach truong.

Cau hinh truong Select:

- Them tung lua chon.
- Chon lua chon mac dinh bang nut radio.
- Sua hoac xoa lua chon da co.

Cau hinh truong Reference:

- Chon bang dich.
- Chon che do quan he.
- Che do Lookup luu ID cua cac ban ghi duoc chon tu bang dich.
- Che do Related record dung them mot truong lien ket cha tren bang dich.
- Khi chon related mode, nhap ten truong lien ket cha. Ung dung co the tao hoac dung mot truong parent-link bi an cho ban ghi lien quan.

## Ban Ghi: Tao, Sua, Xoa Va Xem

Ban ghi la cac dong trong mot bang.

De tao ban ghi:

1. Mo Tables.
2. Chon mot bang.
3. Chon Add Record.
4. Dien cac truong hien thi.
5. Chon Save Record.

De sua ban ghi:

1. Mo Tables.
2. Chon mot bang.
3. Double-click mot dong trong luoi ban ghi.
4. Sua gia tri.
5. Chon Save Record.

De xoa ban ghi:

1. Mo Tables.
2. Chon mot bang.
3. Dung Delete trong cot hanh dong cua luoi ban ghi.
4. Xac nhan thong bao.

Hanh vi nhap lieu ban ghi:

- Truong checkbox luu true/false va hien thi Yes hoac No.
- Truong reference chap nhan danh sach ID ban ghi ngan cach bang dau phay trong form quan tri bang.
- Truong number va finance duoc luu thanh so.
- Gia tri tuy chon de trong se khong duoc gui trong payload; truong required de trong van duoc gui de backend kiem tra.

## Nguoi Dung, Vai Tro Va Quyen

Notcobase dung co che phan quyen theo vai tro.

- Nguoi dung co the co nhieu vai tro.
- Vai tro co the co nhieu quyen.
- Quyen quyet dinh khu vuc UI va hanh dong nao kha dung.

De tao nguoi dung:

1. Mo menu nguoi dung/he thong.
2. Mo Users and Permissions.
3. Trong tab Users, nhap username va password.
4. Chon Create User.

De gan vai tro cho nguoi dung:

1. Mo Users and Permissions.
2. Mo tab Users.
3. Chon mot nguoi dung trong danh sach.
4. Chon mot vai tro chua duoc gan trong danh sach vai tro.
5. Vai tro da gan se xuat hien nhu tag tren nguoi dung dang chon.

De go vai tro khoi nguoi dung:

1. Chon nguoi dung.
2. Chon tag vai tro co dau `x`.

De tao vai tro:

1. Mo Users and Permissions.
2. Mo tab Roles.
3. Nhap ten vai tro.
4. Chon Create Role.

De gan quyen cho vai tro:

1. Mo Users and Permissions.
2. Mo tab Roles.
3. Chon mot vai tro.
4. Tick hoac bo tick quyen trong danh sach quyen.

De tao quyen tuy chinh:

1. Mo Users and Permissions.
2. Mo tab Permissions.
3. Nhap ten quyen.
4. Chon Create Permission.

Quyen tuy chinh huu ich khi can gioi han trang. Tao quyen, gan quyen do cho vai tro, sau do dat Required Permission cua trang thanh quyen do.

## Trang Va Editor Mode

Trang la cac man hinh low-code duoc xay dung tu JSON schema thong qua Page Builder truc quan.

De tao trang:

1. Dang nhap bang nguoi dung co `pages.editor`.
2. Bat Editor mode.
3. Chon nut cong tren thanh dieu huong.
4. Chon them page hoac section.
5. Nhap ten trang.
6. Ung dung mo trang moi trong Editor mode.

De sua thiet lap trang:

1. Bat Editor mode.
2. Mo trang.
3. Dung panel Page o sidebar ben trai.
4. Doi ten trang, required permission, hoac show in navbar.
5. Chon Save.

De gioi han truy cap trang:

1. Tao hoac xac dinh mot quyen.
2. Gan quyen do cho cac vai tro duoc phep truy cap trang.
3. Mo trang trong Editor mode.
4. Trong panel Page, dat Required Permission.
5. Luu.

De an trang khoi thanh dieu huong:

1. Mo trang trong Editor mode.
2. Bo tick Show in Navbar.
3. Luu.

De xoa trang:

1. Mo trang trong Editor mode.
2. Chon Delete trong panel Page.
3. Xac nhan thong bao.

To chuc trang:

- Navigation sections dung de gom nhom trang.
- Trong Editor mode, co the keo tha trang va section de sap xep lai.
- Co the keo trang vao section.
- Xoa section la xoa nhom section, khong nhat thiet xoa cac trang.

## Cac Loai Component Trong Page Builder

Page Builder co the them cac component sau:

- Component bo cuc: `Container`, `Section`, `Grid.Row`, `Grid.Col`, `Tabs`, `Divider`.
- Component van ban va hanh dong: `Heading`, `Text`, `Button`.
- Component truong: `Input`, `InputNumber`, `Input.TextArea`, `Textarea`, `Select`, `Checkbox`, `Switch`, `DatePicker`, `File`, `Reference`.
- Block du lieu: `FormBlock`, `TableBlock`.

Quy trinh chinh sua chung:

1. Bat Editor mode.
2. Chon mot component tren canvas.
3. Dung Add Component de chen component moi vao container dang chon.
4. Dung Configure de sua title, text, layout, field, data, hoac behavior cua component dang chon.
5. Keo component tren canvas de di chuyen truoc, sau, hoac vao trong component khac.
6. Dung nut xoa nho `x` tren component dang chon de xoa. Xoa FormBlock hoac TableBlock se xoa ca block; xoa nhieu container khac co the dua component con len cap tren.
7. Chon Save trong panel Page.

## Component Bo Cuc

Container:

- Container goc cua trang.
- Ho tro cac thuoc tinh layout nhu vertical layout.

Section:

- Gom nhom component.
- Ho tro layout vertical, horizontal va grid.

Grid.Row:

- Tao mot hang voi nhieu cot.
- Cau hinh so cot tu 1 den 12.
- Cau hinh horizontal gutter, vertical gutter, align, justify va wrap.

Grid.Col:

- Mot cot ben trong grid row.
- Cau hinh span, offset, order, flex va responsive spans cho `xs`, `sm`, `md`, `lg`, `xl`, va `xxl`.
- Gia tri span dung he luoi 24 cot.

Tabs:

- Chua cac tab section.
- Cau hinh vi tri tab: top, left, right, hoac bottom.
- Them tab va sua nhan tab tu panel Configure.

Divider:

- Hien duong phan cach voi van ban tuy chon.
- Cau hinh text va orientation.

## Component Text, Heading Va Button

Heading, Text va Button co thiet lap Text.

Dieu huong bang Button:

1. Chon mot Button.
2. Trong Configure, dat Action thanh Navigate to Page.
3. Chon Target Page.
4. Tuy chon cung cap query params JSON.
5. Luu trang.

Neu query params JSON khong hop le, editor se hien loi JSON va khong ap dung thiet lap do.

## Component Truong

Component truong co the duoc dat trong form hoac layout tuy chinh. Cac thiet lap chung:

- Field Name lien ket component voi truong cua ban ghi.
- Placeholder co san cho cac truong dang van ban.
- Required danh dau truong bat buoc.
- Disabled ngan chinh sua.
- Hidden in forms an truong khoi cac form duoc sinh tu dong.
- Visibility cho phep hien truong chi khi mot truong khac thoa dieu kien.

Quy tac hien thi:

- Chon Visible When Field.
- Chon operator: equals, not equals, hoac contains.
- Nhap gia tri can khop.
- De trong Visible When Field neu muon luon hien.

Value generator:

- Co san cho `Input`, `Input.TextArea`, va `Textarea`.
- Bat Generate Value.
- Nhap template vi du `INV-{YYYY}{MM}-{seq:6}`.
- Chon co cho phep sua thu cong hay khong.
- Gia tri sinh tu dong chay khi tao ban ghi.

Static Select options:

- Chon static options.
- Nhap moi option tren mot dong.
- Blur khoi textarea hoac luu sau khi sua de dong bo options.

Dynamic Select options:

- Chon dynamic options.
- Chon source table.
- Chon display column va value column.
- Tuy chon Depends On Field va Filter Field cho dropdown phu thuoc.
- Empty Parent Placeholder duoc hien khi can chon gia tri cha truoc.

Component Reference:

- Chon target table.
- Chon display column, relationship mode, picker variant va add-record action.
- Picker variant co the la table hoac select.
- Add-record action co the mo modal hoac dieu huong den trang khac.
- Related record mode yeu cau parent link field tren target table.

## FormBlock

FormBlock tao hoac sua ban ghi cho mot bang da chon.

De them trang form:

1. Bat Editor mode.
2. Them FormBlock.
3. Chon FormBlock tren canvas.
4. Trong Configure, chon bang nguon.
5. Chon Mode: Auto, Create, hoac Edit.
6. Chon truong trong Form Fields From Columns, hoac dung Select All.
7. Cau hinh submit label va hanh dong sau khi luu.
8. Luu trang.

Che do FormBlock:

- Auto tao ban ghi moi tru khi co record ID trong URL.
- Create luon tao ban ghi moi.
- Edit sua ban ghi duoc xac dinh boi Record ID hoac Record ID Param.

Thiet lap Record ID:

- Record ID co the la mot ID ban ghi co dinh dang so.
- Record ID Param mac dinh la `id` va doc record ID tu query string cua URL trang.

Hanh dong sau khi luu:

- Stay on Page giu nguoi dung o lai form.
- Navigate to Page dua nguoi dung den trang da chon.
- Navigate Back quay lai route truoc trong ung dung.

Shared form group:

- Bat Use Shared Form Group khi nhieu FormBlock can submit cung nhau.
- Dung cung Form Group Key tren cac block can chia se gia tri.
- Show Group Save Button quyet dinh block co hien nut submit chung hay khong.

Quyen tao/sua trong FormBlock:

- Allow Create quyet dinh block co the tao ban ghi hay khong.
- Allow Edit quyet dinh block co the sua ban ghi hay khong.
- Block bi vo hieu hoa trong editor mode.

## TableBlock

TableBlock hien thi ban ghi tu mot bang da chon.

De them bang ban ghi vao trang:

1. Bat Editor mode.
2. Them TableBlock.
3. Chon TableBlock.
4. Chon bang.
5. Chon cac cot hien thi trong Table Columns, hoac dung Select All.
6. Cau hinh page size va hanh vi row/create/edit.
7. Luu trang.

Thiet lap TableBlock:

- Page Size dieu khien phan trang cua grid.
- Row Click co the khong lam gi hoac dieu huong den trang khac.
- Row Target Page chon noi row click dieu huong den.
- Row Mode dat view hoac edit khi dieu huong.
- Row Query Params JSON them tham so khi dieu huong tu row.
- Create Action mo modal hoac dieu huong den trang tao moi.
- Edit Action co the dieu huong den trang sua.
- Create/Edit query params JSON them tham so dieu huong bo sung.
- Allow Create hien hoac an nut New.
- Allow Edit hien hoac an hanh dong Edit.
- Allow Delete hien hanh dong Delete neu duoc bat. Trong renderer hien tai, hanh vi delete cua TableBlock tren trang tuy chinh co the chua hoan thien.

Quy trinh list-to-edit thuong dung:

1. Tao mot trang danh sach voi TableBlock.
2. Tao mot trang sua voi FormBlock o che do Auto hoac Edit.
3. Trong TableBlock, dat Row Click hoac Edit Action thanh Navigate to Page.
4. Chon trang sua.
5. Dam bao tham so dieu huong co `id` hoac dung hanh vi row navigation mac dinh, no truyen `id`, `recordId`, `tableId`, va `mode`.
6. Trong FormBlock, giu Record ID Param la `id`.

Quy trinh tao moi thuong dung:

1. Tao mot trang danh sach voi TableBlock.
2. Tao mot trang tao moi voi FormBlock o che do Create.
3. Trong TableBlock, dat Create Action thanh Navigate to Page.
4. Chon trang tao moi.
5. Luu ca hai trang.

## References Va Ban Ghi Lien Quan

Lookup reference:

- Dung khi mot truong can luu cac ban ghi duoc chon tu bang khac.
- Ban ghi dich duoc chon bang ID trong quan tri bang hoac bang picker cua component Reference trong form trang.

Related record reference:

- Dung khi ban ghi con thuoc ve mot ban ghi cha.
- Yeu cau parent link field tren bang dich.
- Khi tao ban ghi cha voi cac ban ghi con dang draft trong FormBlock, Notcobase tao ban ghi cha truoc, sau do tao ban ghi con voi ID cua cha.

Huong dan ho tro:

- Neu ban ghi lien quan khong hien, kiem tra ban ghi cha da duoc luu chua va ten parent link field co khop cau hinh reference hay khong.
- Neu reference picker trong, kiem tra ban ghi trong target table va quyen `records.view`/`columns.view`.

## Cau Tra Loi Thuong Gap

Cau hoi: Tai sao toi khong thay Editor mode?

Tra loi: Editor mode chi hien voi nguoi dung co `pages.editor`. Hay yeu cau quan tri vien them quyen do vao mot vai tro cua ban.

Cau hoi: Tai sao toi thay mot trang trong Editor mode nhung nguoi dung khac khong thay?

Tra loi: Trang co the yeu cau mot quyen ma nguoi dung do khong co, hoac Show in Navbar dang tat. Hay kiem tra Required Permission va Show in Navbar cua trang trong Editor mode.

Cau hoi: Lam sao de chi manager thay mot trang?

Tra loi: Tao quyen nhu `pages.manager`, gan quyen do cho vai tro Manager, mo trang trong Editor mode, dat Required Permission thanh `pages.manager`, va luu.

Cau hoi: Lam sao tao bang voi cac truong dung chung?

Tra loi: Tao bang cha voi cac truong dung chung. Sau do tao bang con, bat inherit properties from another table, va chon bang cha. Bang con se hien cac truong ke thua cong voi truong rieng cua no.

Cau hoi: Lam sao xay dung trang danh sach va trang sua?

Tra loi: Tao trang sua voi FormBlock tro den bang va Record ID Param dat la `id`. Tao trang danh sach voi TableBlock tro den cung bang. Dat row click hoac edit action dieu huong den trang sua. Luu ca hai trang.

Cau hoi: Tai sao Add Record bi vo hieu hoa?

Tra loi: Add Record co the bi vo hieu hoa khi bang khong co truong form nao hien thi. Nut nay cung co the bi an neu nguoi dung thieu `records.create`.

Cau hoi: Tai sao mot truong duoc danh dau hidden?

Tra loi: Truong co the bi an khoi form bang `hiddenInForms`, va cac truong parent-link cua related reference co the duoc an tu dong. Truong hidden khong hien trong form ban ghi thong thuong.

Cau hoi: Lam sao tao dropdown tu bang khac?

Tra loi: Them hoac chon component Select, chon Dynamic Options, chon source table, sau do chon display column va value column. Tuy chon cau hinh Depends On Field va Filter Field cho dropdown phu thuoc.

Cau hoi: Lam sao xu ly loi "access denied"?

Tra loi: Kiem tra vai tro cua nguoi dung, kiem tra quyen duoc gan cho cac vai tro do, sau do so sanh voi hanh dong nguoi dung dang thuc hien. Khu vuc mac dinh cua ung dung va trang tuy chinh deu phu thuoc vao chuoi quyen.

## Ngu Canh API Cho Ho Tro Nang Cao

UI goi cac route backend sau:

- Auth: `POST /api/auth/register`, `POST /api/auth/login`.
- Tables: `GET /api/tables`, `GET /api/tables/{id}`, `POST /api/tables`, `PUT /api/tables/{id}`, `DELETE /api/tables/{id}`.
- Columns: `GET /api/tables/{tableId}/columns`, `POST /api/tables/{tableId}/columns`, `PUT /api/tables/{tableId}/columns/reorder`, `PUT /api/tables/{tableId}/columns/{columnId}`, `DELETE /api/tables/{tableId}/columns/{columnId}`.
- Records: `GET /api/tables/{tableId}/records`, `GET /api/tables/{tableId}/records/{recordId}`, `POST /api/tables/{tableId}/records`, `PUT /api/tables/{tableId}/records/{recordId}`, `DELETE /api/tables/{tableId}/records/{recordId}`, `POST /api/tables/{tableId}/records/bulk-delete`.
- Users: `GET /api/users`, `GET /api/users/{id}`, `POST /api/users`, `PUT /api/users/{id}`, `DELETE /api/users/{id}`, `POST /api/users/{id}/roles`, `DELETE /api/users/{id}/roles/{roleId}`.
- Roles: `GET /api/roles`, `GET /api/roles/{id}`, `POST /api/roles`, `PUT /api/roles/{id}`, `DELETE /api/roles/{id}`, `POST /api/roles/{id}/permissions`, `DELETE /api/roles/{id}/permissions/{permissionId}`.
- Permissions: `GET /api/permissions`, `GET /api/permissions/{id}`, `POST /api/permissions`, `PUT /api/permissions/{id}`, `DELETE /api/permissions/{id}`.
- Pages: `GET /api/lowcode-pages`, `GET /api/lowcode-pages/{id}`, `POST /api/lowcode-pages`, `PUT /api/lowcode-pages/{id}`, `DELETE /api/lowcode-pages/{id}`.

Chi dung chi tiet API khi ho tro nguoi dung nang cao, debug, hoac giai thich vi sao quyen lai quan trong.
