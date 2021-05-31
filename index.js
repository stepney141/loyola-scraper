const puppeteer = require('puppeteer');
const fs = require('fs');
const setting = require('./setting.json');

const loyola_xpath = {
    login_username: '//input[@name="userName"]',
    login_password: '//input[@name="password"]',
    login_button: '//input[@value="ログイン"]',
    link_from_home_to_board_menu: '//div[@id="tab-kj"]', //ホーム画面ヘッダーの掲示板アイコン
    link_from_home_to_board: '//*[@id="tabmenu-ul"]/li[1]/span', //掲示板アイコンをクリックした先から掲示板本体へ飛ぶリンク
    link_from_main_board_to_univ_bulletin_board: '/html/body/table[3]/tbody/tr[7]/td[1]/a', //掲示板ホームから大学掲示板へのリンク
    club_info_in_main_board: "//td[contains(*, '課外活動')]/p[2]/a", //大学掲示板の中にある課外活動情報へのリンク
    notice_title: "//span[@class='keiji-title']", //掲示タイトル
    notice_description: "//div[@class='keiji-naiyo']", //掲示内容
    notice_date: "//table[2]/tbody/tr[2]/td", //掲載日時
    notice_files: "//table[3]/tbody/tr/td/a", //すべての添付ファイルへのリンク群
};

const fetch_file = async (x, y, time, page) => {
    try {
        let statusCode = 0;
        await page._client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: setting.download_path
        });
        page.on('response', response => {
            statusCode = response.status(); // HTTPステータスコードを取得する
        });
        await mouse_click(x, y, time);
        await page.waitForTimeout(1000);
        if (statusCode == 500) {
            throw new Error('[StatusCode:500]ダウンロードできません');
        }
    } catch (e) {
        const error_m = 'CSVダウンロード_エラー:';
        console.error(error_m + e);
        return false;
    }
    
    const filename = await ((async () => {
        let filename;
        while (!filename || filename.endsWith('.crdownload')) {
            filename = fs.readdirSync(setting.download_path)[0];
        }
        return filename;
    })());
    return true;
};

const loyola_scraper = async (browser) => {
    try {
        const page = await browser.newPage();

        await page.goto(setting.loyola_uri, {
            waitUntil: "networkidle0",
        });

        const userNameInputHandle = page.$x(loyola_xpath.login_username);
        const passwordInputHandle = page.$x(loyola_xpath.login_password);
        const loginButtonHandle = page.$x(loyola_xpath.login_button);

        await (await userNameInputHandle)[0].type(setting.loyola_id); //学籍番号入力
        await (await passwordInputHandle)[0].type(setting.loyola_password); //パスワード入力
        await (await loginButtonHandle)[0].click(); //ログインボタンを押す
        
        await page.waitForNavigation({ //画面遷移待ち
            timeout: 60000,
            waitUntil: "networkidle0",
        });

        const linkToBoardMenuHandle = page.$x(loyola_xpath.link_from_home_to_board_menu);
        await (await linkToBoardMenuHandle)[0].click(); //掲示板メニューを開く

        await page.waitForNavigation({ //画面遷移待ち
            timeout: 60000,
            waitUntil: "networkidle0",
        });

        const linkToBoardHandle = page.$x(loyola_xpath.link_from_home_to_board);
        await (await linkToBoardHandle)[0].click(); //掲示板本体へ飛ぶ

        const linkToUnivBulletinBoardHandle = page.$x(loyola_xpath.link_from_main_board_to_univ_bulletin_board);
        await (await linkToUnivBulletinBoardHandle)[0].click(); //大学掲示板へ飛ぶ

        await page.waitForNavigation({ //画面遷移待ち
            timeout: 60000,
            waitUntil: "networkidle0",
        });

    } catch (e) {
        console.log(e);
        await browser.close();
        return false;
    }
    return true; 
};

(async () => {
    
    const browser = await puppeteer.launch({
        defaultViewport: { width: 1000, height: 1000 },
        // headless: true,
        headless: false,
        // slowMo: 100
    });

    await loyola_scraper(browser);

    await browser.close();

})();