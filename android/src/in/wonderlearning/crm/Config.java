package in.wonderlearning.crm;

/** Where the app opens. Change BASE_URL (and rebuild with android/build.sh) when the CRM moves domain. */
final class Config {
    static final String BASE_URL = "https://wonder-learning-crm.vercel.app";
    /** Other addresses that count as "the CRM" (e.g. the client's own domain during a move). */
    static final String[] EXTRA_HOSTS = {};
    private Config() {}
}
