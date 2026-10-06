# Bếp quyết định

Ứng dụng chọn món ăn bằng vòng quay, đấu loại và lập mâm cơm. Danh sách khởi tạo nằm trong `data/dishes.csv`; danh sách cá nhân, danh mục, tùy chọn và lịch sử được lưu trên trình duyệt đang dùng.

## Mở ứng dụng

Chạy máy chủ tĩnh trong thư mục này để ứng dụng tự đọc được CSV:

```sh
python3 -m http.server 8000
```

Sau đó truy cập `http://localhost:8000`. Mở `index.html` qua `file://` vẫn cho phép nhập CSV thủ công, nhưng trình duyệt chặn việc tự đọc `data/dishes.csv`.

## Có sẵn

- Vòng quay chọn đều giữa các món đủ điều kiện.
- Đấu loại 4, 8 hoặc 16 món, chọn trực tiếp hoặc để trò chơi chọn ngẫu nhiên.
- Lập mâm gồm món chính, món rau và món canh.
- Thêm cách nấu và vai trò món trong “Quản lý món”; bật “Trong mâm” để tạo ô lập mâm cho vai trò mới.
- Yêu thích, lọc theo cách nấu, và hạn chế chọn lại món đã chốt trong 3, 7 hoặc 14 ngày.
- Thêm, sửa, xóa món; nhập CSV/JSON, nạp lại danh sách gốc từ CSV và tải CSV để sao lưu.
- Lịch sử chọn món và lưu trữ cục bộ trên thiết bị.

Danh sách khởi tạo hiện có 143 món: 25 món từ ảnh đầu và 118 món đọc rõ từ các ảnh bổ sung. Những dòng bị cắt tên ở mép ảnh được bỏ qua. Vai trò món chính, món rau và món canh được gán theo tên món; có thể sửa lại trong “Quản lý món”. App chỉ nạp CSV tự động khi chưa có dữ liệu lưu. Nút “Nạp lại từ CSV” thay danh sách món hiện tại bằng nội dung file và giữ lịch sử.

CSV mặc định dùng các cột `id,name,method,role,favorite`. Cột `id` có thể bỏ qua khi nhập; nên giữ `id` ổn định khi sửa CSV để lịch sử vẫn nhận đúng món. Tên cách nấu hoặc vai trò mới trong CSV sẽ tự thêm vào danh mục. Vai trò mới mặc định chưa xuất hiện trong mâm; bật “Trong mâm” ở phần quản lý vai trò để thêm ô chọn món. Các file cũ dùng cột `group` thay cho `method` vẫn được chấp nhận. Ví dụ:

```csv
id,name,method,role,favorite
seed-1,Ba chỉ kho tiêu,Kho / Rim,main,false
rau-muong-xao-toi,Rau muống xào tỏi,Xào / Rang / Sốt,Món rau,true
canh-bi-do,Canh bí đỏ nấu tôm,Khác,Món canh,false
```
