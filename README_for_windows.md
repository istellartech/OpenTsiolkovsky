# OpenTsiolkovskiy for Windows

## MSYS2をインストール

http://msys2.github.io/

で  msys2-x86_64-20160205.exe (または似たような名前) のほうを押してダウンロードしてインストールします。

インストール後は "MinGW-w64 Win64 Shell" のなかで作業します。
インストール完了時にウインドウが開きます。スタートメニューにも入ります。

インストールできたらとりあえずアップデートします。

    $ update-core

アップデートが終ったら閉じるボタンでウインドウを閉じます。残りのパッケージのアップデートをします。

    $ pacman -Su

そのあと必要なパッケージのインストール。

    $ pacman -S git
    $ pacman -S gcc
    $ pacman -S make
    $ pacman -S mingw64/mingw-w64-x86_64-boost

## GCCへのパッチあて

なんと面倒なことにこのmingw64のGCC(すくなくとも4.9.2)にはバグがあり、手動でパッチが必要です。

    C:\msys64\usr\lib\gcc\x86_64-pc-msys\4.9.2\include\c++\x86_64-pc-msys\bits\c++config.h

ファイルで、中ほどの

    /* #undef _GLIBCXX_USE_C99 */

の行を

    #define _GLIBCXX_USE_C99 1

に変更して保存してください。

## ソースコードのClone

    $ git clone https://github.com/istellartech/OpenTsiolkovsky

※ただしこの方法はReadonlyです。

## コンパイル

    $ cd OpenTsiolkovsky
    $ make

でコンパイルできます。色々エラーはきますがたぶんできます。

    $ cd bin
    $ ./OpenTsiolkovsky

で実行。

## ここのファイルの場所

通常は、C:/msys64/home/(自分のユーザー名) 以下に生成されます。
現在のディレクトリをWindowsのパスで知りたいときは、
    $ pwd -W
とすると良いようです。
