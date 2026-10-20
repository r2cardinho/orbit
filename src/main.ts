// Entry point: loads the styles. The screen parts are added in the next steps.
import './styles/tokens.css'
import './styles/base.css'
import { getFollowers, getFollowing, getProfile, getRateLimit } from './api/github.ts'

// Temporary: shows a real user's data in the console until the graph exists.
const TEST_USER = 'r2cardinho'

async function logTestUser(): Promise<void> {
  try {
    const profile = await getProfile(TEST_USER)
    console.log('Profile:', profile)

    const followers = await getFollowers(TEST_USER)
    console.log(`Followers (page ${followers.page}, more pages: ${followers.hasNextPage}):`, followers.users)

    const following = await getFollowing(TEST_USER)
    console.log(`Following (page ${following.page}, more pages: ${following.hasNextPage}):`, following.users)
  } catch (error) {
    console.error(error)
  }

  const rateLimit = getRateLimit()
  if (rateLimit === null) {
    console.log('Rate limit: no request made (everything came from the cache).')
  } else {
    console.log(`${rateLimit.remaining} of ${rateLimit.limit} requests left this hour. Resets at ${rateLimit.resetAt.toLocaleTimeString('en-US')}.`)
  }
}

logTestUser()
